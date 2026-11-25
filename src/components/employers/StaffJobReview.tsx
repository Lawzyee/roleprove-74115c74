import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tick } from './Fields';
import { getStaffEmployerJobFn, moderateEmployerJobFn, setCompanyPostingReviewFn, getPostingLimitsFn, savePostingLimitsFn } from '@/lib/employer-jobs.functions';
import { POSTING_REJECT_REASONS } from '@/lib/employer-jobs';
export function StaffJobReview({ id }: { id: string }) {
  const qc = useQueryClient(); const q = useQuery({ queryKey: ['staff-employer-job', id], queryFn: () => getStaffEmployerJobFn({ data: { id } }) });
  const moderate = useServerFn(moderateEmployerJobFn); const setReview = useServerFn(setCompanyPostingReviewFn);
  const [reason, setReason] = useState<string>(POSTING_REJECT_REASONS[0]); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  if (q.isPending) return <p>Loading…</p>; if (q.error || !q.data) return <p role="alert">{q.error?.message ?? 'Job unavailable.'}</p>;
  const { job, company, review } = q.data; const p = job.payload as Record<string, unknown>;
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['staff-jobs'] }); await qc.invalidateQueries({ queryKey: ['staff-employer-job', id] }); };
  const act = async (action: 'approve' | 'reject' | 'unpublish') => { setBusy(true); try { await moderate({ data: { id, action, reason: action === 'approve' ? '' : `${reason}${note ? ': ' + note : ''}` } }); await refresh(); toast.success('Review saved.'); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  return <section className="space-y-5"><div><h2 className="font-display text-2xl font-semibold">{String(p['title'])}</h2><p className="mt-2">{company.name} · {company.status}</p><p className="mt-2 text-sm">employer_account · {review.required ? 'Review required' : 'Established posting history'} · {review.approvals} / {review.threshold} approvals</p></div><div className="flex flex-wrap gap-2">{job.flags.map(f => <Badge key={f} variant="destructive">{f}</Badge>)}</div><p className="whitespace-pre-wrap text-sm">{String(p['full_description'])}</p><a className="break-all text-sm text-primary underline" href={String(p['apply_url'])} target="_blank" rel="noopener noreferrer">{String(p['apply_url'])}</a><details><summary className="cursor-pointer text-sm font-medium">Private practice text</summary><p className="mt-3 whitespace-pre-wrap text-sm">{job.practice_text || 'None'}</p></details><p className="text-sm">{job.views} views · {job.apply_clicks} apply clicks</p>
    <Tick id={`review-${id}`} checked={company.review_every_posting} onChange={async every => { try { await setReview({ data: { companyId: company.id, every } }); await refresh(); } catch (e) { toast.error((e as Error).message); } }}>Review every posting from this company</Tick>
    <Label className="block space-y-2">Reason<Select value={reason} onValueChange={setReason}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{POSTING_REJECT_REASONS.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select></Label><Label className="block space-y-2">Note shown to the employer<Textarea value={note} maxLength={800} onChange={e => setNote(e.target.value)} /></Label><div className="flex flex-wrap gap-3">{job.status === 'pending_review' && <><Button disabled={busy} onClick={() => void act('approve')}>Approve job</Button><Button disabled={busy} variant="destructive" onClick={() => void act('reject')}>Reject job</Button></>}{job.status === 'published' && <Button disabled={busy} variant="destructive" onClick={() => void act('unpublish')}>Unpublish job</Button>}</div>{job.moderation_reason && <p className="text-sm">{job.moderation_reason}</p>}
  </section>;
}
export function PostingLimits() {
  const qc = useQueryClient(); const q = useQuery({ queryKey: ['posting-limits'], queryFn: () => getPostingLimitsFn() }); const save = useServerFn(savePostingLimitsFn);
  const [draft, setDraft] = useState<NonNullable<typeof q.data> | null>(null); const v = draft ?? q.data;
  if (!v) return null;
  const labels = { employer_job_review_count: 'Initial approvals required', employer_active_jobs: 'Active jobs per company', employer_daily_jobs: 'Submissions per day', employer_job_retention_months: 'Closed job retention (months)' };
  return <section className="mt-10 border-t border-border pt-6"><h2 className="font-display text-lg font-semibold">Employer posting limits</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{(Object.keys(labels) as Array<keyof typeof labels>).map(k => <Label key={k}>{labels[k]}<Input type="number" min={1} value={v[k]} onChange={e => setDraft({ ...v, [k]: Number(e.target.value) })} /></Label>)}</div><Button className="mt-4" variant="outline" disabled={!draft} onClick={async () => { if (!draft) return; try { await save({ data: draft }); setDraft(null); await qc.invalidateQueries({ queryKey: ['posting-limits'] }); toast.success('Limits saved.'); } catch (e) { toast.error((e as Error).message); } }}>Save posting limits</Button></section>;
}