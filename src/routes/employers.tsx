import { createFileRoute, Link } from '@tanstack/react-router';
import { PLACEHOLDERS } from "@/lib/auth-entry";
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { Briefcase, Users } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tick, MultiTicks, Honeypot, ROLE_LABELS, employerHead } from '@/components/employers/Fields';
import { joinWaitlistFn, requestSubmitLinkFn } from '@/lib/employer.functions';
import { COMPANY_SIZES, HIRING_TYPES, HIRES_PER_YEAR, EMPLOYER_ROLES, waitlistSchema } from '@/lib/employer';
import { ARRANGEMENTS } from '@/lib/job-center';

export const Route = createFileRoute('/employers')({
  head: () => employerHead('For employers', 'Hire on demonstrated skills. List a job link on RoleProve for free and join the employer waitlist.'),
  component: Employers,
});

function Employers() {
  return <><SiteHeader /><main className="mx-auto max-w-5xl px-5 py-12">
    <section className="max-w-3xl">
      <p className="text-sm font-medium text-primary">For employers</p>
      <h1 className="mt-2 font-display text-4xl font-semibold leading-tight">Hire on what people can actually do</h1>
      <p className="mt-4 text-lg text-muted-foreground">Candidates on RoleProve complete realistic job simulations for roles like Data Analyst and Customer Support. They can share a portfolio and verified practice score, but only with employers they choose.</p>
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-accent p-4 text-sm"><span>Hiring? Create an employer account with your work email.</span><Button asChild size="sm"><Link to="/auth" search={{ mode: "signup", as: "hiring" }}>Create an employer account</Link></Button></div>
      <div className="mt-6 flex flex-wrap gap-3"><Button asChild size="lg"><a href="#list-a-job"><Briefcase className="mr-2 h-4 w-4" />List a job</a></Button><Button asChild size="lg" variant="outline"><a href="#waitlist"><Users className="mr-2 h-4 w-4" />Join the waitlist</a></Button></div>
    </section>
    <div className="mt-14 grid gap-10 lg:grid-cols-2">
      <ListJob />
      <Waitlist />
    </div>
    <section className="mt-14 max-w-3xl"><h2 className="font-display text-2xl font-semibold">Questions</h2>
      <Accordion type="multiple" className="mt-3">
        <AccordionItem value="cost"><AccordionTrigger>What will it cost?</AccordionTrigger><AccordionContent>Listing a job link is free for now. Pricing for employer accounts has not been decided.</AccordionContent></AccordionItem>
        <AccordionItem value="data"><AccordionTrigger>How is candidates' data protected?</AccordionTrigger><AccordionContent>Candidates' profiles, answers and scores stay private unless they choose to share them. Employers can't browse candidates. Read our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>.</AccordionContent></AccordionItem>
        <AccordionItem value="review"><AccordionTrigger>How do you review listings?</AccordionTrigger><AccordionContent>Every submitted job is checked by our team before it appears. We look at whether the apply link belongs to your company or a known hiring tool, whether it works, and whether the job looks genuine. Listings are never published automatically, and they're marked as external listings.</AccordionContent></AccordionItem>
        <AccordionItem value="remove"><AccordionTrigger>How do I remove a listing?</AccordionTrigger><AccordionContent>Every email we send about your listing has a "Remove this listing" link that takes it down straight away, with no sign-in. You can also email support@roleprove.com.</AccordionContent></AccordionItem>
      </Accordion>
    </section>
  </main></>;
}

function ListJob() {
  const request = useServerFn(requestSubmitLinkFn);
  const [email, setEmail] = useState(''); const [hp, setHp] = useState(''); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return <section id="list-a-job" className="relative scroll-mt-20 rounded-lg border border-border p-6">
    <h2 className="font-display text-2xl font-semibold">List a job</h2>
    <p className="mt-2 text-sm text-muted-foreground">No account needed. Enter your work email and we'll send a link that lets you submit jobs for 24 hours. Our team reviews each listing before it appears.</p>
    {msg?.ok ? <p role="status" className="mt-5 rounded-md bg-accent p-4 text-sm">{msg.text}</p> :
    <form className="mt-5 space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); setMsg(null); try { const r = await request({ data: { email, website: hp } }); setMsg('error' in r && r.error ? { ok: false, text: r.error } : { ok: true, text: 'Check your inbox for a confirmation link. It opens the job form.' }); } catch { setMsg({ ok: false, text: 'Enter a valid email address.' }); } finally { setBusy(false); } }}>
      <Label className="block space-y-2">Work email<Input type="email" required autoComplete="email" placeholder={PLACEHOLDERS.workEmail} value={email} onChange={e => setEmail(e.target.value)} /></Label>
      <Honeypot value={hp} onChange={setHp} />
      {msg && <p role="alert" className="text-sm text-destructive">{msg.text}</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send confirmation link'}</Button>
    </form>}
  </section>;
}

type W = { full_name: string; email: string; company: string; job_title: string; company_size: string; country: string; roles: string[]; other_role: string; hiring_types: string[]; arrangements: string[]; hires_per_year: string; message: string; consent: boolean };
function Waitlist() {
  const join = useServerFn(joinWaitlistFn);
  const [v, setV] = useState<W>({ full_name: '', email: '', company: '', job_title: '', company_size: '', country: '', roles: [], other_role: '', hiring_types: [], arrangements: [], hires_per_year: '', message: '', consent: false });
  const [hp, setHp] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState('');
  const set = <K extends keyof W>(k: K, x: W[K]) => setV(p => ({ ...p, [k]: x }));
  const text = (k: keyof W, label: string, type = 'text', required = false, placeholder?: string) => <Label className="block space-y-2">{label}{required && ' *'}<Input type={type} required={required} placeholder={placeholder} value={String(v[k])} onChange={e => set(k, e.target.value as never)} /></Label>;
  const pick = (k: 'company_size' | 'hires_per_year', label: string, opts: readonly string[]) => <Label className="block space-y-2">{label}<Select value={v[k]} onValueChange={x => set(k, x)}><SelectTrigger aria-label={label}><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{opts.map(o => <SelectItem key={o} value={o}>{o.replace('-', ' to ')}</SelectItem>)}</SelectContent></Select></Label>;
  return <section id="waitlist" className="relative scroll-mt-20 rounded-lg border border-border p-6">
    <h2 className="font-display text-2xl font-semibold">Join the employer waitlist</h2>
    <p className="mt-2 text-sm text-muted-foreground">Tell us how you hire. We'll email you to confirm, and only confirmed entries join the list.</p>
    {done ? <p role="status" className="mt-5 rounded-md bg-accent p-4 text-sm">{done}</p> :
    <form className="mt-5 space-y-4" onSubmit={async e => { e.preventDefault(); setErr('');
      const parsed = waitlistSchema.safeParse({ ...v, company_size: v.company_size || null, hires_per_year: v.hires_per_year || null, website: hp });
      if (!parsed.success) { setErr(parsed.error.issues[0]?.message ?? 'Check the form.'); return; }
      setBusy(true); try { const r = await join({ data: parsed.data }); if ('error' in r && r.error) setErr(r.error); else if ('message' in r) setDone(r.message); } catch { setErr('Could not join the waitlist. Please try again.'); } finally { setBusy(false); } }}>
      <div className="grid gap-4 sm:grid-cols-2">{text('full_name', 'Full name', 'text', false, PLACEHOLDERS.name)}{text('email', 'Work email', 'email', true, PLACEHOLDERS.workEmail)}{text('company', 'Company name', 'text', false, PLACEHOLDERS.company)}{text('job_title', 'Job title', 'text', false, PLACEHOLDERS.jobTitle)}{pick('company_size', 'Company size', COMPANY_SIZES)}{text('country', 'Country')}</div>
      <MultiTicks legend="Roles you hire for" options={EMPLOYER_ROLES} value={v.roles as never} onChange={x => set('roles', x)} labels={ROLE_LABELS} />
      {v.roles.includes('other') && text('other_role', 'Other role')}
      <MultiTicks legend="Hiring types" options={HIRING_TYPES} value={v.hiring_types as never} onChange={x => set('hiring_types', x)} />
      <MultiTicks legend="Work arrangement" options={ARRANGEMENTS} value={v.arrangements as never} onChange={x => set('arrangements', x)} />
      {pick('hires_per_year', 'Roughly how many hires a year?', HIRES_PER_YEAR)}
      <Label className="block space-y-2">Message (optional)<Textarea maxLength={2000} value={v.message} onChange={e => set('message', e.target.value)} /></Label>
      <Tick id="wl-consent" checked={v.consent} onChange={x => set('consent', x)}>I agree to be contacted about RoleProve's employer features. See the <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>. *</Tick>
      <Honeypot value={hp} onChange={setHp} />
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Join the waitlist'}</Button>
    </form>}
  </section>;
}
