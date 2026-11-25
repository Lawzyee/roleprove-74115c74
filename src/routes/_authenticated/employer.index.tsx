import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tick } from '@/components/employers/Fields';
import { CompanyForm, HowWeReview, Levels, StatusBanner, emptyCompany } from '@/components/employers/AccountParts';
import { useEmployerState } from '@/components/employers/useEmployerState';
import { acceptInviteFn, createCompanyFn, mySubmissionsFn, requestJoinFn } from '@/lib/employer-accounts.functions';
import { employerHead } from '@/components/employers/Fields';

export const Route = createFileRoute('/_authenticated/employer/')({ head: () => employerHead('Employer overview', 'Your company status, job postings and team on RoleProve.', false), component: Overview });

function Overview() {
  const q = useEmployerState();
  if (q.isPending) return <p>Loading…</p>;
  if (q.error || !q.data) return <p role="alert" className="text-destructive">Could not load your employer area. Please refresh.</p>;
  const s = q.data;
  if (!s.member || !s.company) return <Onboarding state={s} />;
  return <div className="space-y-6">
    <div><h1 className="font-display text-3xl font-semibold">{s.company.name}</h1><p className="mt-1 text-sm text-muted-foreground">@{s.company.email_domain} · You are the {s.member.role}</p></div>
    <StatusBanner status={s.company.status} reason={s.company.status_reason} />
    <div><p className="mb-2 text-sm font-medium">Labels</p><Levels levels={s.levels} /></div>
    {s.access.full && <Submissions />}
    {s.access.full && <Button asChild><Link to="/employer/jobs">Company jobs</Link></Button>}
    <HowWeReview compact />
  </div>;
}

function Submissions() {
  const fn = useServerFn(mySubmissionsFn);
  const q = useQuery({ queryKey: ['employer-submissions'], queryFn: () => fn() });
  return <section><h2 className="font-display text-xl font-semibold">Your job listings</h2>
    <p className="mt-1 text-sm text-muted-foreground">Job links sent through the For employers page from your company's email domain.</p>
    {q.isPending ? <p className="mt-3 text-sm">Loading…</p> : !q.data?.rows.length ? <p className="mt-3 text-sm text-muted-foreground">No listings yet.</p> :
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border">{q.data.rows.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><div><p className="font-medium">{r.title}</p><p className="text-xs text-muted-foreground">Sent {r.created_at.slice(0, 10)} · Expires {r.expires_date}</p></div><Badge variant={r.status === 'published' ? 'default' : 'outline'}>{r.status === 'pending_review' ? 'Waiting for review' : r.status === 'published' ? 'Live' : r.status}</Badge></li>)}</ul>}
  </section>;
}

type State = NonNullable<ReturnType<typeof useEmployerState>['data']>;
function Onboarding({ state }: { state: State }) {
  const qc = useQueryClient();
  const create = useServerFn(createCompanyFn); const join = useServerFn(requestJoinFn); const accept = useServerFn(acceptInviteFn);
  const [terms, setTerms] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['employer-state'] });
  if (state.invites.length) return <div className="max-w-xl space-y-4"><h1 className="font-display text-3xl font-semibold">You've been invited</h1>
    {state.invites.map((i) => <div key={i.id} className="space-y-3 rounded-lg border border-border p-4"><p><strong>{i.company}</strong> invited you as a {i.role}. The invite expires on {i.expires_at.slice(0, 10)}.</p>
      <Tick id={`t-${i.id}`} checked={terms} onChange={setTerms}>I agree to the <Link to="/employer-terms" target="_blank" className="text-primary underline">Employer Terms</Link> and <Link to="/privacy" target="_blank" className="text-primary underline">Privacy Policy</Link></Tick>
      <Button disabled={!terms || busy} onClick={async () => { setBusy(true); setErr(''); const r = await accept({ data: { inviteId: i.id, terms: true } }); setBusy(false); if ('error' in r) setErr(r.error); else refresh(); }}>Accept invite</Button></div>)}
    {err && <p role="alert" className="text-sm text-destructive">{err}</p>}</div>;
  if (state.domainCompany) return <div className="max-w-xl space-y-4"><h1 className="font-display text-3xl font-semibold">Join your company</h1>
    <p>A company already uses @{state.domain} on RoleProve: <strong>{state.domainCompany.name}</strong>. Each email domain has one company account.</p>
    {state.joinRequested ? <p role="status" className="rounded-lg border border-border bg-accent p-4 text-sm">Request sent. The company owner can approve it from their Team page, or invite you.</p>
      : <Button disabled={busy} onClick={async () => { setBusy(true); const r = await join(); setBusy(false); if ('error' in r) setErr(r.error); else refresh(); }}>Ask to join</Button>}
    {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    <p className="text-sm text-muted-foreground">If this isn't your company, <Link to="/support/new" className="text-primary underline">contact support</Link>.</p></div>;
  return <div className="max-w-2xl space-y-4"><h1 className="font-display text-3xl font-semibold">Set up your company</h1>
    <p className="text-muted-foreground">You'll be the company owner. Our team reviews every company before it can do anything beyond editing its profile.</p>
    <CompanyForm initial={emptyCompany()} domain={state.domain} submitLabel="Send for review" onSubmit={async (v) => { const r = await create({ data: v }); if ('error' in r) return r.error; await refresh(); return null; }} />
  </div>;
}
