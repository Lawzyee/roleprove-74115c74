import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';
import { Tick, employerHead } from '@/components/employers/Fields';
import { useAuth } from '@/hooks/useAuth';
import { acceptInviteFn, getInviteFn } from '@/lib/employer-accounts.functions';

export const Route = createFileRoute('/employers_/invite')({
  validateSearch: (s: Record<string, unknown>): { token?: string } => ({ token: typeof s.token === 'string' ? s.token : undefined }),
  head: () => employerHead('Team invite', 'Accept an invite to join a company on RoleProve.', false),
  component: Page,
});

function Page() {
  const { token } = Route.useSearch(); const { user, loading } = useAuth();
  const get = useServerFn(getInviteFn); const accept = useServerFn(acceptInviteFn);
  const q = useQuery({ queryKey: ['invite', token], enabled: !!token, queryFn: () => get({ data: { token: token! } }) });
  const [terms, setTerms] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const inv = q.data?.invite;
  let body: React.ReactNode;
  if (!token || (q.isSuccess && !inv)) body = <p>This invite link isn't valid or has already been used. Ask the company owner for a new invite.</p>;
  else if (q.isPending || loading) body = <p>Loading…</p>;
  else if (inv?.expired) body = <p>This invite has expired. Ask the company owner to send a new one.</p>;
  else if (done) body = <><p role="status">You've joined {inv!.company}.</p><Button asChild className="mt-4"><Link to="/employer">Open the employer area</Link></Button></>;
  else if (!user) body = <><p><strong>{inv!.company}</strong> invited {inv!.email} to join as a {inv!.role}.</p><p className="mt-2 text-sm text-muted-foreground">Create an employer account with {inv!.email}, or sign in if you have one, then open this link again.</p>
    <div className="mt-4 flex flex-wrap gap-3"><Button asChild><Link to="/auth" search={{ mode: "signup", as: "hiring" }}>Create employer account</Link></Button><Button asChild variant="outline"><Link to="/auth" search={{ mode: "login" }}>Sign in</Link></Button></div></>;
  else body = <><p><strong>{inv!.company}</strong> invited {inv!.email} to join as a {inv!.role}.</p>
    <div className="mt-4"><Tick id="inv-terms" checked={terms} onChange={setTerms}>I agree to the <Link to="/employer-terms" target="_blank" className="text-primary underline">Employer Terms</Link> and <Link to="/privacy" target="_blank" className="text-primary underline">Privacy Policy</Link></Tick></div>
    {err && <p role="alert" className="mt-2 text-sm text-destructive">{err}</p>}
    <Button className="mt-4" disabled={!terms || busy} onClick={async () => { setBusy(true); setErr(''); const r = await accept({ data: { token, terms: true } }).catch((e: Error) => ({ error: e.message })); setBusy(false); if ('error' in r) setErr(r.error); else setDone(true); }}>Accept invite</Button></>;
  return <><SiteHeader /><main className="mx-auto max-w-xl px-5 py-12"><h1 className="mb-4 font-display text-3xl font-semibold">Team invite</h1>{body}</main></>;
}
