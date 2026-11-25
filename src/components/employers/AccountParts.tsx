import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COMPANY_SIZES } from '@/lib/employer';
import { INDUSTRIES, companySchema, LEVEL_EMAIL, LEVEL_REVIEWED, type CompanyInput, type CompanyStatus } from '@/lib/employer-accounts';

export const STATUS_LABEL: Record<CompanyStatus, string> = { pending: 'Waiting for review', approved: 'Reviewed by RoleProve', rejected: 'Not approved', suspended: 'Suspended' };

export function HowWeReview({ compact = false }: { compact?: boolean }) {
  return <section aria-labelledby="how-we-review" className={compact ? '' : 'max-w-3xl'}>
    <h2 id="how-we-review" className="font-display text-xl font-semibold">How we review employers</h2>
    <p className="mt-2 text-sm text-muted-foreground">Companies show one or both of these labels:</p>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
      <li><strong>{LEVEL_EMAIL}:</strong> the person who signed up confirmed an email at the company's own domain, and that domain matches the company website.</li>
      <li><strong>{LEVEL_REVIEWED}:</strong> our team checked the email domain and the website, plus the company registration number and public company page if they were given.</li>
    </ul>
    <p className="mt-2 text-sm text-muted-foreground">These labels don't guarantee that a company is reputable or financially sound, or that every job is genuine. We can suspend a company at any time.</p>
  </section>;
}

export function Levels({ levels }: { levels: string[] }) {
  if (!levels.length) return <span className="text-sm text-muted-foreground">No labels yet</span>;
  return <div className="flex flex-wrap gap-2">{levels.map((l) => <Badge key={l} variant={l === LEVEL_REVIEWED ? 'default' : 'outline'}>{l}</Badge>)}</div>;
}

export function StatusBanner({ status, reason }: { status: CompanyStatus; reason?: string }) {
  const tone = status === 'approved' ? 'border-primary/40 bg-accent' : status === 'pending' ? 'border-border bg-muted' : 'border-destructive/40 bg-destructive/10';
  const body: Record<CompanyStatus, ReactNode> = {
    pending: 'Our team is reviewing your company. Until then you can edit your company profile and check this page for updates.',
    approved: 'Your company has been reviewed by RoleProve.',
    rejected: <>We couldn't approve your company. If you think this is a mistake, <Link to="/support/new" className="text-primary underline">contact support</Link>.</>,
    suspended: <>Your company account is suspended, so your team can't use the employer area. <Link to="/support/new" className="text-primary underline">Contact support</Link>.</>,
  };
  return <div role="status" className={`rounded-lg border p-4 ${tone}`}>
    <p className="font-medium">Status: {STATUS_LABEL[status]}</p>
    <p className="mt-1 text-sm">{body[status]}</p>
    {reason && status !== 'approved' ? <p className="mt-1 text-sm"><strong>Reason:</strong> {reason}</p> : null}
  </div>;
}

export const emptyCompany = (): CompanyInput => ({ name: '', website: 'https://', country: '', size_band: '1-10', industry: 'technology', description: '', registration_number: '', public_page_url: '' });

export function CompanyForm({ initial, domain, submitLabel, disabled, onSubmit }: { initial: CompanyInput; domain: string; submitLabel: string; disabled?: boolean; onSubmit: (v: CompanyInput) => Promise<string | null> }) {
  const [f, setF] = useState<CompanyInput>(initial);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = <K extends keyof CompanyInput>(k: K, v: CompanyInput[K]) => { setF({ ...f, [k]: v }); setErrs({ ...errs, [k]: '' }); };
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    const p = companySchema.safeParse(f);
    if (!p.success) { setErrs(Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message]))); return; }
    setBusy(true); const r = await onSubmit(p.data); setBusy(false); if (r) setErr(r);
  }
  const field = (k: keyof CompanyInput, label: string, el: ReactNode, hint?: string) => <div className="space-y-1.5"><Label htmlFor={`c-${k}`}>{label}</Label>{el}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}{errs[k] && <p className="text-sm text-destructive">{errs[k]}</p>}</div>;
  return <form onSubmit={submit} className="space-y-4">
    <fieldset disabled={disabled || busy} className="space-y-4">
      {field('name', 'Company name', <Input id="c-name" value={f.name} maxLength={180} onChange={(e) => set('name', e.target.value)} />)}
      {field('website', 'Company website', <Input id="c-website" value={f.website} maxLength={300} onChange={(e) => set('website', e.target.value)} />, `Your email domain is @${domain}. A website on the same domain gets the "${LEVEL_EMAIL}" label.`)}
      <div className="grid gap-4 sm:grid-cols-2">
        {field('country', 'Country', <Input id="c-country" value={f.country} maxLength={100} onChange={(e) => set('country', e.target.value)} />)}
        {field('size_band', 'Company size', <Select value={f.size_band} onValueChange={(v) => set('size_band', v as CompanyInput['size_band'])}><SelectTrigger id="c-size_band"><SelectValue /></SelectTrigger><SelectContent>{COMPANY_SIZES.map((s) => <SelectItem key={s} value={s}>{s} people</SelectItem>)}</SelectContent></Select>)}
      </div>
      {field('industry', 'Industry', <Select value={f.industry} onValueChange={(v) => set('industry', v as CompanyInput['industry'])}><SelectTrigger id="c-industry"><SelectValue /></SelectTrigger><SelectContent>{INDUSTRIES.map((s) => <SelectItem key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent></Select>)}
      {field('description', 'Short description', <Textarea id="c-description" value={f.description} maxLength={600} rows={4} onChange={(e) => set('description', e.target.value)} />, `${f.description.length}/600 characters. Plain text only.`)}
      {field('registration_number', 'Company registration number (optional)', <Input id="c-registration_number" value={f.registration_number} maxLength={60} onChange={(e) => set('registration_number', e.target.value)} />)}
      {field('public_page_url', 'Public company page (optional)', <Input id="c-public_page_url" value={f.public_page_url} maxLength={300} placeholder="https://" onChange={(e) => set('public_page_url', e.target.value)} />, 'For example your page on a company register or LinkedIn.')}
    </fieldset>
    {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
    {!disabled && <Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>}
  </form>;
}
