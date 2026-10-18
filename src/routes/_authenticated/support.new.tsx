import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAuth } from '@/hooks/useAuth';
import { uploadScreenshot } from '@/components/support/SupportParts';
import { createTicketFn } from '@/lib/support.functions';
import { BODY_MAX, SUBJECT_MAX, SUPPORT_CATEGORIES, type SupportCategory } from '@/lib/support';

const categories = SUPPORT_CATEGORIES.map((c) => c.value) as string[];
export const Route = createFileRoute('/_authenticated/support/new')({
  validateSearch: (s: Record<string, unknown>): { category?: SupportCategory; attemptId?: string } => ({
    category: typeof s.category === 'string' && categories.includes(s.category) ? s.category as SupportCategory : undefined,
    attemptId: typeof s.attemptId === 'string' && /^[0-9a-f-]{36}$/i.test(s.attemptId) ? s.attemptId : undefined,
  }),
  head: () => ({ meta: [
    { title: 'Contact support | RoleProve' },
    { name: 'description', content: 'Open a RoleProve support ticket about billing, scoring, data or technical problems.' },
    { property: 'og:title', content: 'Contact support | RoleProve' },
    { property: 'og:description', content: 'Send a request to RoleProve support.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: NewTicket,
});

function NewTicket() {
  const search = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dispute = search.category === 'scoring_dispute' && Boolean(search.attemptId);
  const [category, setCategory] = useState<SupportCategory>(dispute ? 'scoring_dispute' : search.category ?? 'other');
  const [subject, setSubject] = useState(dispute ? 'Score dispute' : '');
  const [body, setBody] = useState('');
  const [dataRequest, setDataRequest] = useState<'export' | 'delete'>('export');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = SUPPORT_CATEGORIES.filter((c) => c.value !== 'scoring_dispute' || dispute);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true); setError(null);
    try {
      const attachment = file ? await uploadScreenshot(user.id, file) : undefined;
      const result = await createTicketFn({ data: { category, subject, body, attachment,
        attemptId: category === 'scoring_dispute' ? search.attemptId : undefined,
        dataRequest: category === 'data_request' ? dataRequest : undefined } });
      if ('error' in result) throw new Error(result.error);
      await qc.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success('Ticket sent');
      navigate({ to: '/support/$ticketId', params: { ticketId: result.ticketId } });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send the ticket.'); }
    finally { setBusy(false); }
  }

  return <><SiteHeader /><main className="mx-auto max-w-2xl px-5 py-10">
    <h1 className="font-display text-3xl font-semibold">{dispute ? 'Dispute this score' : 'Contact support'}</h1>
    {dispute && <p className="mt-2 text-sm text-muted-foreground">The attempt is attached so a person can review it. Disputing never changes your score automatically.</p>}
    <form onSubmit={submit} className="mt-6 space-y-5">
      <div className="space-y-2"><Label>Category</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as SupportCategory)} disabled={dispute}>
          <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
          <SelectContent>{options.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
        {!dispute && <p className="text-xs text-muted-foreground">To dispute a score, use "Dispute this score" on the attempt's results page.</p>}
      </div>
      {category === 'data_request' && <div className="space-y-2 rounded-lg border border-border p-4">
        <RadioGroup value={dataRequest} onValueChange={(v) => setDataRequest(v as 'export' | 'delete')}>
          <div className="flex items-center gap-2"><RadioGroupItem id="dr-export" value="export" /><Label htmlFor="dr-export">Export my data</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem id="dr-delete" value="delete" /><Label htmlFor="dr-delete">Delete my account</Label></div>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">Faster: export or delete instantly from <Link to="/settings" className="text-primary underline">Settings</Link>.</p>
      </div>}
      <div className="space-y-2"><Label htmlFor="subject">Subject</Label><Input id="subject" value={subject} maxLength={SUBJECT_MAX} onChange={(e) => setSubject(e.target.value)} required /></div>
      <div className="space-y-2"><Label htmlFor="body">Message</Label><Textarea id="body" rows={7} value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} required /></div>
      <div className="space-y-2"><Label htmlFor="file">Screenshot (optional, PNG/JPG, max 5 MB)</Label><Input id="file" type="file" accept="image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send ticket</Button>
    </form>
  </main></>;
}
