import { StaffReviewNav } from '@/components/jobs/StaffReviewNav';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { toast } from 'sonner';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { employerHead } from '@/components/employers/Fields';
import { STATUS_LABEL } from '@/components/employers/AccountParts';
import { getIsSupportStaffFn } from '@/lib/support.functions';
import { getEmailDomainListsFn, saveEmailDomainListsFn, staffCompaniesFn, staffCompanyActionFn, staffCompanyAuditFn, staffCompanyNotesFn } from '@/lib/employer-accounts.functions';
import type { CompanyStatus, StaffAction } from '@/lib/employer-accounts';

export const Route = createFileRoute('/_authenticated/admin/companies')({ head: () => employerHead('Companies', 'Staff-only employer company review.', false), component: Page });
type Row = Awaited<ReturnType<typeof staffCompaniesFn>>['rows'][number];
const ACTIONS: Record<CompanyStatus, StaffAction[]> = { pending: ['approve', 'reject'], approved: ['suspend'], rejected: ['approve'], suspended: ['reinstate'] };

function Page() {
  const staff = useQuery({ queryKey: ['is-staff'], queryFn: () => getIsSupportStaffFn() });
  const list = useServerFn(staffCompaniesFn);
  const q = useQuery({ queryKey: ['staff-companies'], queryFn: () => list(), enabled: staff.data?.staff === true });
  const [filter, setFilter] = useState<CompanyStatus | 'all'>('pending');
  if (staff.isPending) return <><SiteHeader /><main className="p-8">Checking access…</main></>;
  if (!staff.data?.staff) return <><SiteHeader /><main className="mx-auto max-w-6xl px-5 py-10"><h1 className="text-2xl font-semibold">Not available</h1><p className="mt-3">This page is for RoleProve support staff only.</p></main></>;
  const rows = (q.data?.rows ?? []).filter((r) => filter === 'all' || r.status === filter);
  return <><SiteHeader /><main className="mx-auto max-w-6xl px-5 py-9">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-3xl font-semibold">Companies</h1><Button asChild variant="outline"><Link to="/admin/employers">Employer waitlist</Link></Button></div>
    <StaffReviewNav/><div className="mt-5 flex flex-wrap gap-2">{(['pending', 'approved', 'rejected', 'suspended', 'all'] as const).map((s) => <Button key={s} size="sm" variant={filter === s ? 'default' : 'outline'} onClick={() => setFilter(s)}>{s === 'all' ? 'All' : STATUS_LABEL[s]} ({(q.data?.rows ?? []).filter((r) => s === 'all' || r.status === s).length})</Button>)}</div>
    {q.isPending ? <p className="mt-6">Loading…</p> : !rows.length ? <p className="mt-6 text-muted-foreground">No companies here.</p> : <div className="mt-6 space-y-4">{rows.map((r) => <CompanyCard key={r.id} r={r} />)}</div>}
    <DomainLists />
  </main></>;
}

function CompanyCard({ r }: { r: Row }) {
  const qc = useQueryClient(); const act = useServerFn(staffCompanyActionFn); const saveNotes = useServerFn(staffCompanyNotesFn); const audit = useServerFn(staffCompanyAuditFn);
  const [reason, setReason] = useState(''); const [notes, setNotes] = useState(r.notes); const [busy, setBusy] = useState(false); const [showLog, setShowLog] = useState(false);
  const log = useQuery({ queryKey: ['company-audit', r.id], enabled: showLog, queryFn: () => audit({ data: { id: r.id } }) });
  async function run(action: StaffAction) {
    if (action !== 'approve' && action !== 'reinstate' && !reason.trim()) return toast.error('Give a reason. The company sees it.');
    setBusy(true); const res = await act({ data: { id: r.id, action, reason } }); setBusy(false);
    if ('error' in res) return toast.error(res.error);
    toast.success('Done'); setReason(''); qc.invalidateQueries({ queryKey: ['staff-companies'] }); qc.invalidateQueries({ queryKey: ['company-audit', r.id] });
  }
  const check = (ok: boolean, label: string) => <Badge variant={ok ? 'default' : 'outline'}>{ok ? '✓' : '✗'} {label}</Badge>;
  return <article className="rounded-lg border border-border p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-display text-lg font-semibold">{r.name}</h2><p className="text-sm text-muted-foreground">@{r.email_domain} · {r.country} · {r.size_band} · {r.industry} · created {r.created_at.slice(0, 10)}</p></div><Badge>{STATUS_LABEL[r.status as CompanyStatus]}</Badge></div>
    <div className="mt-3 flex flex-wrap gap-2">{check(r.ownerConfirmed, 'Owner email confirmed')}{check(r.domainCheck, 'Website matches email domain')}<Badge variant="outline">{r.memberCount} member(s)</Badge></div>
    <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      <div><dt className="inline text-muted-foreground">Owner: </dt><dd className="inline break-all">{r.ownerEmail || '—'}</dd></div>
      <div><dt className="inline text-muted-foreground">Website: </dt><dd className="inline break-all">{r.website}</dd></div>
      <div><dt className="inline text-muted-foreground">Registration no.: </dt><dd className="inline">{r.registration_number || '—'}</dd></div>
      <div><dt className="inline text-muted-foreground">Public page: </dt><dd className="inline break-all">{r.public_page_url || '—'}</dd></div>
      <div><dt className="inline text-muted-foreground">Related job submissions: </dt><dd className="inline">{r.relatedSubmissions}</dd></div>
      <div><dt className="inline text-muted-foreground">Related waitlist entries: </dt><dd className="inline">{r.relatedWaitlist}</dd></div>
      {r.relatedCompanies.length > 0 && <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Companies on related domains: </dt><dd className="inline">{r.relatedCompanies.join('; ')}</dd></div>}
    </dl>
    {r.description && <p className="mt-2 whitespace-pre-wrap text-sm">{r.description}</p>}
    {r.status_reason && <p className="mt-2 text-sm"><strong>Last reason:</strong> {r.status_reason}</p>}
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div className="space-y-2"><Label htmlFor={`reason-${r.id}`}>Reason (shown to the company and logged)</Label><Textarea id={`reason-${r.id}`} rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex flex-wrap gap-2">{ACTIONS[r.status as CompanyStatus].map((a) => <Button key={a} size="sm" disabled={busy} variant={a === 'reject' || a === 'suspend' ? 'destructive' : 'default'} onClick={() => run(a)}>{a[0]!.toUpperCase() + a.slice(1)}</Button>)}</div></div>
      <div className="space-y-2"><Label htmlFor={`notes-${r.id}`}>Staff notes (never shown to the company)</Label><Textarea id={`notes-${r.id}`} rows={2} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const res = await saveNotes({ data: { id: r.id, notes } }); if ('error' in res) toast.error(res.error); else toast.success('Notes saved'); }}>Save notes</Button></div>
    </div>
    <Button size="sm" variant="link" className="mt-2 px-0" onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide' : 'Show'} activity log</Button>
    {showLog && (log.isPending ? <p className="text-sm">Loading…</p> : <ul className="mt-1 space-y-1 text-xs">{(log.data?.rows ?? []).map((l) => <li key={l.id}>{l.created_at.slice(0, 16).replace('T', ' ')} · {l.actor} ({l.actor_kind}) · {l.action}{l.reason ? ` — ${l.reason}` : ''}</li>)}</ul>)}
  </article>;
}

function DomainLists() {
  const get = useServerFn(getEmailDomainListsFn); const save = useServerFn(saveEmailDomainListsFn);
  const q = useQuery({ queryKey: ['email-domain-lists'], queryFn: () => get() });
  const [p, setP] = useState<string | null>(null); const [d, setD] = useState<string | null>(null);
  if (!q.data) return null;
  const parse = (s: string) => s.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return <section className="mt-10 rounded-lg border border-border p-4"><h2 className="font-display text-xl font-semibold">Blocked email domains for employer accounts</h2>
    <div className="mt-3 grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor="dl-p">Personal email domains (one per line)</Label><Textarea id="dl-p" rows={8} value={p ?? q.data.personal.join('\n')} onChange={(e) => setP(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="dl-d">Temporary email domains (one per line)</Label><Textarea id="dl-d" rows={8} value={d ?? q.data.disposable.join('\n')} onChange={(e) => setD(e.target.value)} /></div>
    </div>
    <Button className="mt-3" size="sm" onClick={async () => { try { const r = await save({ data: { personal: parse(p ?? q.data!.personal.join('\n')), disposable: parse(d ?? q.data!.disposable.join('\n')) } }); if (r && 'error' in r) toast.error(String(r.error)); else { toast.success('Lists saved'); q.refetch(); } } catch { toast.error('Enter domains like example.com'); } }}>Save lists</Button>
  </section>;
}
