import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBanner } from '@/components/employers/AccountParts';
import { useEmployerState } from '@/components/employers/useEmployerState';
import { createInviteFn, decideJoinFn, listTeamFn, removeMemberFn, revokeInviteFn, transferOwnershipFn } from '@/lib/employer-accounts.functions';

export const Route = createFileRoute('/_authenticated/employer/team')({ component: TeamPage });
const ROLE_HELP = { owner: 'Manages the company and team', recruiter: 'Will post jobs and review applicants in later versions', viewer: 'Read-only' } as const;

function TeamPage() {
  const s = useEmployerState();
  if (s.isPending) return <p>Loading…</p>;
  if (!s.data?.company) return <p>Set up your company from the Overview tab first.</p>;
  if (!s.data.access.full) return <div className="max-w-2xl space-y-4"><h1 className="font-display text-3xl font-semibold">Team</h1><StatusBanner status={s.data.company.status} reason={s.data.company.status_reason} /><p className="text-sm text-muted-foreground">You can invite colleagues once RoleProve has reviewed your company.</p></div>;
  return <Team />;
}

function Team() {
  const qc = useQueryClient();
  const list = useServerFn(listTeamFn); const invite = useServerFn(createInviteFn); const revoke = useServerFn(revokeInviteFn);
  const remove = useServerFn(removeMemberFn); const transfer = useServerFn(transferOwnershipFn); const decide = useServerFn(decideJoinFn);
  const q = useQuery({ queryKey: ['employer-team'], queryFn: () => list() });
  const [email, setEmail] = useState(''); const [role, setRole] = useState<'recruiter' | 'viewer'>('viewer'); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['employer-team'] }); qc.invalidateQueries({ queryKey: ['employer-state'] }); };
  const run = async (p: Promise<{ error: string } | { ok: true }>, done: string) => { setBusy(true); const r = await p; setBusy(false); if ('error' in r) { toast.error(r.error); return false; } toast.success(done); refresh(); return true; };
  if (q.isPending) return <p>Loading…</p>;
  if (q.error || !q.data) return <p role="alert" className="text-destructive">{q.error?.message ?? 'Could not load your team.'}</p>;
  const t = q.data; const owner = t.role === 'owner';
  return <div className="max-w-3xl space-y-8">
    <div><h1 className="font-display text-3xl font-semibold">Team</h1><p className="mt-1 text-sm text-muted-foreground">{t.used} of {t.maxSeats} seats used (members and open invites).</p></div>
    <section><h2 className="font-display text-xl font-semibold">Members</h2>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border">{t.members.map((m) => <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0"><p className="truncate font-medium">{m.name || m.email}{m.you && ' (you)'}</p><p className="truncate text-xs text-muted-foreground">{m.email} · {ROLE_HELP[m.role]}</p></div>
        <div className="flex flex-wrap items-center gap-2"><Badge variant={m.role === 'owner' ? 'default' : 'outline'}>{m.role}</Badge>
          {owner && !m.you && <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm(`Make ${m.email} the owner? You'll become a recruiter.`)) run(transfer({ data: { id: m.userId } }), 'Ownership transferred'); }}>Make owner</Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm(`Remove ${m.email}? They lose access straight away.`)) run(remove({ data: { id: m.userId } }), 'Member removed'); }}>Remove</Button>
          </>}</div>
      </li>)}</ul>
    </section>
    {owner && <section><h2 className="font-display text-xl font-semibold">Invite a colleague</h2>
      <p className="mt-1 text-sm text-muted-foreground">Only @{t.domain} addresses. The link works once and expires in 7 days.</p>
      <form className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={async (e) => { e.preventDefault(); setErr(''); setBusy(true); const r = await invite({ data: { email, role } }).catch((x: Error) => ({ error: x.message.includes('email') ? 'Enter a valid email address.' : x.message })); setBusy(false); if ('error' in r) setErr(r.error); else { toast.success('Invite sent'); setEmail(''); refresh(); } }}>
        <div className="flex-1 space-y-1.5"><Label htmlFor="inv-email">Work email</Label><Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`name@${t.domain}`} /></div>
        <div className="space-y-1.5"><Label htmlFor="inv-role">Role</Label><Select value={role} onValueChange={(v) => setRole(v as 'recruiter' | 'viewer')}><SelectTrigger id="inv-role" className="sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="viewer">Viewer</SelectItem><SelectItem value="recruiter">Recruiter</SelectItem></SelectContent></Select></div>
        <Button type="submit" disabled={busy || t.used >= t.maxSeats}>Send invite</Button>
      </form>
      {err && <p role="alert" className="mt-2 text-sm text-destructive">{err}</p>}
      {t.invites.length > 0 && <ul className="mt-4 divide-y divide-border rounded-lg border border-border">{t.invites.map((i) => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><div><p className="font-medium">{i.email}</p><p className="text-xs text-muted-foreground">{i.role} · expires {i.expires_at.slice(0, 10)}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => run(revoke({ data: { id: i.id } }), 'Invite cancelled')}>Cancel invite</Button></li>)}</ul>}
    </section>}
    {owner && t.requests.length > 0 && <section><h2 className="font-display text-xl font-semibold">Requests to join</h2>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border">{t.requests.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><div><p className="font-medium">{r.name || r.email}</p><p className="text-xs text-muted-foreground">{r.email}</p></div><div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => run(decide({ data: { id: r.id, approve: true, role: 'viewer' } }), 'Added as viewer')}>Add as viewer</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => run(decide({ data: { id: r.id, approve: false, role: 'viewer' } }), 'Request declined')}>Decline</Button></div></li>)}</ul>
    </section>}
  </div>;
}
