import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tick, Honeypot, employerHead } from '@/components/employers/Fields';
import { HowWeReview } from '@/components/employers/AccountParts';
import { employerSignUpFn } from '@/lib/employer-accounts.functions';
import { employerSignUpSchema } from '@/lib/employer-accounts';

export const Route = createFileRoute('/employers_/sign-up')({
  head: () => employerHead('Create an employer account', 'Create a RoleProve employer account with your work email.', true),
  component: Page,
});

function Page() {
  const signUp = useServerFn(employerSignUpFn);
  const [f, setF] = useState({ name: '', email: '', password: '', terms: false }); const [hp, setHp] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    const p = employerSignUpSchema.safeParse({ ...f, website: hp });
    if (!p.success) return setErr(p.error.issues[0]?.message ?? 'Check the form.');
    setBusy(true); const r = await signUp({ data: p.data }).catch(() => ({ error: 'Something went wrong. Please try again.' })); setBusy(false);
    if ('error' in r) setErr(r.error); else setSent(true);
  }
  return <><SiteHeader /><main className="mx-auto grid max-w-5xl gap-10 px-5 py-12 md:grid-cols-2">
    <div>
      <h1 className="font-display text-3xl font-semibold">Create an employer account</h1>
      {sent ? <div role="status" className="mt-6 rounded-lg border border-border bg-accent p-4"><p className="font-medium">Check your email</p><p className="mt-1 text-sm">We sent a confirmation link to {f.email}. Open it, then sign in to set up your company.</p></div> :
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="space-y-1.5"><Label htmlFor="su-name">Your name</Label><Input id="su-name" autoComplete="name" value={f.name} maxLength={180} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="su-email">Work email</Label><Input id="su-email" type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@yourcompany.com" /><p className="text-xs text-muted-foreground">Personal and temporary email addresses can't be used.</p></div>
        <div className="space-y-1.5"><Label htmlFor="su-pw">Password</Label><Input id="su-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <Tick id="su-terms" checked={f.terms} onChange={(v) => setF({ ...f, terms: v })}>I agree to the <Link to="/employer-terms" target="_blank" className="text-primary underline">Employer Terms</Link> and <Link to="/privacy" target="_blank" className="text-primary underline">Privacy Policy</Link></Tick>
        <Honeypot value={hp} onChange={setHp} />
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Creating…' : 'Create employer account'}</Button>
        <p className="text-sm text-muted-foreground">Already have an account? <Link to="/auth" className="text-primary underline">Sign in</Link>. Looking for a job? <Link to="/auth" className="text-primary underline">Create a candidate account</Link>.</p>
      </form>}
    </div>
    <HowWeReview compact />
  </main></>;
}
