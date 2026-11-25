import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useRef, useState } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tick, Honeypot, ROLE_LABELS, employerHead } from '@/components/employers/Fields';
import { openSubmitSessionFn, submitEmployerJobFn } from '@/lib/employer.functions';
import { employerJobSchema, addDays, DEFAULT_EXPIRY_DAYS, MAX_EXPIRY_DAYS, EMPLOYER_ROLES } from '@/lib/employer';
import { ARRANGEMENTS, EMPLOYMENT } from '@/lib/job-center';

export const Route = createFileRoute('/employers_/submit')({
  validateSearch: (s: Record<string, unknown>): { token?: string } => ({ token: typeof s.token === 'string' ? s.token : undefined }),
  head: () => employerHead('List a job', 'Submit a job link to the RoleProve Job center for review.', false),
  component: Page,
});
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ submitter_name: '', title: '', company: '', company_website: '', city: '', country: '', arrangement: 'remote', employment: 'full-time', role_key: 'data_analyst', other_role: '', seniority: 'entry',
  salary_currency: '', salary_min: '', salary_max: '', salary_period: '', summary: '', apply_url: '', expires_date: addDays(today(), DEFAULT_EXPIRY_DAYS), practice_text: '',
  practice_consent: false, authorised: false, genuine: false, no_fees: false, terms: false, join_waitlist: false });
type F = ReturnType<typeof blank>;

function Page() {
  const { token } = Route.useSearch(); const open = useServerFn(openSubmitSessionFn); const submit = useServerFn(submitEmployerJobFn);
  const [session, setSession] = useState<{ email: string; expiresAt: string } | 'loading' | 'invalid' | 'expired'>('loading');
  const [f, setF] = useState<F>(blank); const [hp, setHp] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [sent, setSent] = useState(0);
  const started = useRef(false);
  useEffect(() => { if (!token) { setSession('invalid'); return; } if (started.current) return; started.current = true;
    open({ data: { token } }).then(r => setSession(r.ok ? { email: r.email, expiresAt: r.expiresAt } : 'expired' in r && r.expired ? 'expired' : 'invalid')).catch(() => setSession('invalid')); }, [token, open]);
  const set = <K extends keyof F>(k: K, x: F[K]) => setF(p => ({ ...p, [k]: x }));
  const text = (k: keyof F, label: string, type = 'text') => <Label className="block min-w-0 space-y-2">{label}<Input type={type} value={String(f[k])} onChange={e => set(k, e.target.value as never)} /></Label>;
  const pick = (k: keyof F, label: string, opts: readonly string[], labels?: Record<string, string>) => <Label className="block space-y-2">{label}<Select value={String(f[k])} onValueChange={x => set(k, x as never)}><SelectTrigger aria-label={label}><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{opts.map(o => <SelectItem key={o} value={o}>{labels?.[o] ?? o}</SelectItem>)}</SelectContent></Select></Label>;
  const shell = (body: React.ReactNode) => <><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-12"><h1 className="font-display text-3xl font-semibold">List a job</h1>{body}</main></>;
  if (session === 'loading') return shell(<p className="mt-4">Checking your link…</p>);
  if (session === 'invalid' || session === 'expired') return shell(<><p role="alert" className="mt-4">{session === 'expired' ? 'This link has expired (links work for 24 hours after you open them).' : 'This link is not valid.'} Please request a new one.</p><Button asChild className="mt-5"><Link to="/employers">Back to For employers</Link></Button></>);
  if (sent) return shell(<><p role="status" className="mt-4 rounded-md bg-accent p-4">Thanks — your job was sent for review. It won't appear until our team approves it, and we'll email you either way.</p><Button className="mt-5" onClick={() => { setF(blank()); setSent(0); }}>List another job</Button></>);
  return shell(<>
    <p className="mt-3 text-sm text-muted-foreground">Confirmed as <strong>{session.email}</strong>. You can submit jobs until {new Date(session.expiresAt).toLocaleString()}. Every listing is reviewed before it appears.</p>
    <form className="relative mt-8 space-y-6" onSubmit={async e => { e.preventDefault(); setErr('');
      const num = (s: string) => s === '' ? null : Number(s);
      const parsed = employerJobSchema().safeParse({ ...f, token, website: hp, salary_currency: f.salary_currency.toUpperCase() || null, salary_min: num(f.salary_min), salary_max: num(f.salary_max), salary_period: f.salary_period || null });
      if (!parsed.success) { setErr(parsed.error.issues[0]?.message ?? 'Check the form.'); return; }
      setBusy(true); try { const r = await submit({ data: parsed.data }); if ('error' in r && r.error) setErr(r.error); else setSent(n => n + 1); } catch { setErr('Could not submit the job. Please try again.'); } finally { setBusy(false); } }}>
      <div className="grid gap-4 sm:grid-cols-2">{text('submitter_name', 'Your name')}{text('title', 'Job title')}{text('company', 'Company name')}{text('company_website', 'Company website (https://…)', 'url')}{text('city', 'City')}{text('country', 'Country')}
        {pick('arrangement', 'Work arrangement', ARRANGEMENTS)}{pick('employment', 'Employment type', EMPLOYMENT)}{pick('role_key', 'Role', EMPLOYER_ROLES, ROLE_LABELS)}{f.role_key === 'other' && text('other_role', 'Role name')}{pick('seniority', 'Seniority', ['entry', 'mid', 'senior'])}
        {text('apply_url', 'Apply link (https://…)', 'url')}<Label className="block space-y-2">Expiry date (max {MAX_EXPIRY_DAYS} days)<Input type="date" min={today()} max={addDays(today(), MAX_EXPIRY_DAYS)} value={f.expires_date} onChange={e => set('expires_date', e.target.value)} /></Label></div>
      <fieldset className="grid gap-3 sm:grid-cols-4"><legend className="mb-2 text-sm font-medium">Salary range (optional)</legend>{text('salary_currency', 'Currency (e.g. USD)')}{text('salary_min', 'Minimum', 'number')}{text('salary_max', 'Maximum', 'number')}{pick('salary_period', 'Period', ['hour', 'month', 'year'])}</fieldset>
      <Label className="block space-y-2">Short summary (plain text, max 600 characters)<Textarea maxLength={600} rows={4} value={f.summary} onChange={e => set('summary', e.target.value)} /><span className="text-xs text-muted-foreground">{f.summary.length}/600</span></Label>
      <section className="space-y-3 rounded-lg border border-border p-4"><h2 className="font-medium">Practice for this role (optional)</h2><p className="text-sm text-muted-foreground">Paste the full job description and we can generate practice exercises for candidates. It's stored privately and never shown in full.</p>
        <Textarea aria-label="Job description for practice" rows={6} maxLength={20000} value={f.practice_text} onChange={e => set('practice_text', e.target.value)} />
        {f.practice_text && <Tick id="practice" checked={f.practice_consent} onChange={x => set('practice_consent', x)}>I confirm I have the right to share this text and allow RoleProve to use it to generate practice exercises for candidates. It will not be shown in full to candidates.</Tick>}</section>
      <div className="space-y-3">
        <Tick id="auth" checked={f.authorised} onChange={x => set('authorised', x)}>I am authorised to post this job for this company.</Tick>
        <Tick id="genuine" checked={f.genuine} onChange={x => set('genuine', x)}>This job is genuine, lawful and non-discriminatory.</Tick>
        <Tick id="fees" checked={f.no_fees} onChange={x => set('no_fees', x)}>Candidates are never charged to apply.</Tick>
        <Tick id="terms" checked={f.terms} onChange={x => set('terms', x)}>I accept the <Link to="/terms" hash="employer-terms" className="text-primary underline">Employer Terms</Link>.</Tick>
        <Tick id="join" checked={f.join_waitlist} onChange={x => set('join_waitlist', x)}>Also add me to the employer waitlist (we'll email you to confirm, and contact you only about RoleProve's employer features — see the <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>).</Tick>
      </div>
      <Honeypot value={hp} onChange={setHp} />
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit for review'}</Button>
    </form></>);
}
