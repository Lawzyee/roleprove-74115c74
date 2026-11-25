import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { employerHead, ROLE_LABELS } from '@/components/employers/Fields';
import { getIsSupportStaffFn } from '@/lib/support.functions';
import { getWaitlistFn } from '@/lib/employer.functions';
import { COMPANY_SIZES, HIRING_TYPES, EMPLOYER_ROLES } from '@/lib/employer';
import { ARRANGEMENTS } from '@/lib/job-center';

export const Route = createFileRoute('/_authenticated/admin/employers')({ head: () => employerHead('Employer waitlist', 'Staff-only employer waitlist.', false), component: Page });
type Row = Awaited<ReturnType<typeof getWaitlistFn>>['rows'][number];
const csvCell = (v: unknown) => { const s = Array.isArray(v) ? v.join('; ') : String(v ?? ''); const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; return `"${safe.replace(/"/g, '""')}"`; };

function Page() {
  const staff = useQuery({ queryKey: ['is-staff'], queryFn: () => getIsSupportStaffFn() });
  const q = useQuery({ queryKey: ['employer-waitlist'], queryFn: () => getWaitlistFn(), enabled: staff.data?.staff === true });
  const [f, setF] = useState({ role: 'all', type: 'all', arrangement: 'all', size: 'all', country: 'all', confirmed: 'all' });
  const rows = q.data?.rows ?? [];
  const countries = useMemo(() => [...new Set(rows.map(r => r.country).filter(Boolean))].sort(), [rows]);
  const shown = rows.filter(r => (f.role === 'all' || r.roles.includes(f.role)) && (f.type === 'all' || r.hiring_types.includes(f.type)) && (f.arrangement === 'all' || r.arrangements.includes(f.arrangement)) && (f.size === 'all' || r.company_size === f.size) && (f.country === 'all' || r.country === f.country) && (f.confirmed === 'all' || (f.confirmed === 'yes') === Boolean(r.confirmed_at)));
  const confirmed = rows.filter(r => r.confirmed_at);
  if (staff.isPending) return <><SiteHeader /><main className="p-8">Checking access…</main></>;
  if (!staff.data?.staff) return <><SiteHeader /><main className="mx-auto max-w-6xl px-5 py-10"><h1 className="text-2xl font-semibold">Not available</h1><p className="mt-3">This page is for RoleProve support staff only.</p></main></>;
  const sel = (k: keyof typeof f, label: string, opts: readonly string[], labels?: Record<string, string>) => <Select value={f[k]} onValueChange={v => setF({ ...f, [k]: v })}><SelectTrigger aria-label={label} className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All {label.toLowerCase()}</SelectItem>{opts.map(o => <SelectItem key={o} value={o}>{labels?.[o] ?? o}</SelectItem>)}</SelectContent></Select>;
  const exportCsv = () => {
    const cols: (keyof Row)[] = ['full_name', 'email', 'company', 'job_title', 'company_size', 'country', 'roles', 'other_role', 'hiring_types', 'arrangements', 'hires_per_year', 'message', 'personal_email', 'confirmed_at', 'created_at'];
    const csv = [cols.join(','), ...shown.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `employer-waitlist-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const countBy = (pick: (r: Row) => string[], opts: readonly string[], labels?: Record<string, string>) => opts.map(o => <Badge key={o} variant="outline">{labels?.[o] ?? o}: {confirmed.filter(r => pick(r).includes(o)).length}</Badge>);
  return <><SiteHeader /><main className="mx-auto max-w-6xl px-5 py-9">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-3xl font-semibold">Employer waitlist</h1><div className="flex gap-2"><Button asChild variant="outline"><Link to="/admin/jobs">Staff jobs</Link></Button><Button onClick={exportCsv} disabled={!shown.length}><Download className="mr-2 h-4 w-4" />Export CSV</Button></div></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-lg border border-border p-4"><p className="text-sm text-muted-foreground">Confirmed</p><p className="font-display text-3xl font-semibold">{confirmed.length}</p></div><div className="rounded-lg border border-border p-4"><p className="text-sm text-muted-foreground">Unconfirmed</p><p className="font-display text-3xl font-semibold">{rows.length - confirmed.length}</p></div></div>
    <p className="mt-5 text-sm font-medium">Confirmed by role</p><div className="mt-2 flex flex-wrap gap-2">{countBy(r => r.roles, EMPLOYER_ROLES, ROLE_LABELS)}</div>
    <p className="mt-4 text-sm font-medium">Confirmed by work arrangement</p><div className="mt-2 flex flex-wrap gap-2">{countBy(r => r.arrangements, ARRANGEMENTS)}</div>
    <div className="mt-6 flex flex-wrap gap-2">{sel('role', 'Roles', EMPLOYER_ROLES, ROLE_LABELS)}{sel('type', 'Hiring types', HIRING_TYPES)}{sel('arrangement', 'Arrangements', ARRANGEMENTS)}{sel('size', 'Sizes', COMPANY_SIZES)}{sel('country', 'Countries', countries)}{sel('confirmed', 'Statuses', ['yes', 'no'], { yes: 'Confirmed', no: 'Unconfirmed' })}</div>
    {q.error && <p role="alert" className="mt-4 text-destructive">{q.error.message}</p>}
    <div className="mt-5 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Name / email</TableHead><TableHead>Company</TableHead><TableHead>Size</TableHead><TableHead>Country</TableHead><TableHead>Roles</TableHead><TableHead>Hiring</TableHead><TableHead>Hires/yr</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>{shown.map(r => <TableRow key={r.id}><TableCell><div>{r.full_name || '—'}</div><div className="text-xs text-muted-foreground">{r.email}</div>{r.personal_email && <Badge variant="destructive" className="mt-1">personal email</Badge>}</TableCell><TableCell>{r.company}<div className="text-xs text-muted-foreground">{r.job_title}</div></TableCell><TableCell>{r.company_size}</TableCell><TableCell>{r.country}</TableCell><TableCell>{r.roles.map(x => ROLE_LABELS[x] ?? x).join(', ')}{r.other_role && ` (${r.other_role})`}</TableCell><TableCell className="text-xs">{[...r.hiring_types, ...r.arrangements].join(', ')}</TableCell><TableCell>{r.hires_per_year}</TableCell><TableCell>{r.confirmed_at ? <Badge>Confirmed</Badge> : <Badge variant="outline">Unconfirmed</Badge>}</TableCell></TableRow>)}</TableBody></Table>
      {!shown.length && <p className="py-6 text-sm text-muted-foreground">No entries match.</p>}</div>
  </main></>;
}
