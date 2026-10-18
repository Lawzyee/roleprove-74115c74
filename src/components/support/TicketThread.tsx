import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { StatusBadge, uploadScreenshot } from './SupportParts';
import { categoryLabel, BODY_MAX } from '@/lib/support';
import { getAttachmentUrlFn, markTicketReadFn, replyTicketFn, setTicketStatusFn } from '@/lib/support.functions';

export function TicketThread({ ticketId, staff = false }: { ticketId: string; staff?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['support-ticket', ticketId],
    queryFn: async () => {
      const { data, error } = await supabase.from('support_tickets')
        .select('id, category, subject, status, created_at, attempt_id, data_request, tags, support_messages(id, sender, body, created_at, support_attachments(id, file_name))')
        .eq('id', ticketId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!query.data) return;
    markTicketReadFn({ data: { ticketId } }).then(() => qc.invalidateQueries({ queryKey: ['support-tickets'] })).catch(() => undefined);
  }, [query.data, ticketId, qc]);

  async function refresh() {
    await Promise.all([qc.invalidateQueries({ queryKey: ['support-ticket', ticketId] }), qc.invalidateQueries({ queryKey: ['support-tickets'] }), qc.invalidateQueries({ queryKey: ['admin-tickets'] })]);
  }
  async function send() {
    if (!user) return;
    setBusy(true);
    try {
      const attachment = file ? await uploadScreenshot(user.id, file) : undefined;
      const result = await replyTicketFn({ data: { ticketId, body: reply, attachment } });
      if ('error' in result) throw new Error(result.error);
      setReply(''); setFile(null); await refresh(); toast.success('Reply sent');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not send reply'); }
    finally { setBusy(false); }
  }
  async function setStatus(status: 'open' | 'replied' | 'resolved') {
    const result = await setTicketStatusFn({ data: { ticketId, status } });
    if ('error' in result) return toast.error(result.error);
    await refresh();
  }
  async function openAttachment(id: string) {
    const tab = window.open('about:blank', '_blank');
    const result = await getAttachmentUrlFn({ data: { attachmentId: id } });
    if ('error' in result) { tab?.close(); return toast.error(result.error); }
    if (tab) tab.location.href = result.url;
  }

  if (query.isPending) return <p className="text-sm text-muted-foreground">Loading ticket…</p>;
  const t = query.data;
  if (!t) return <p role="alert" className="text-sm text-destructive">Ticket not found.</p>;
  const messages = [...(t.support_messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return <div className="space-y-6">
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><StatusBadge status={t.status} /><span>{categoryLabel(t.category)}</span>{t.data_request && <span>· {t.data_request === 'export' ? 'Export my data' : 'Delete my account'}</span>}{t.tags.includes('legal_deadline') && <span className="text-destructive">· Legal deadline</span>}</div>
      <h1 className="mt-2 font-display text-2xl font-semibold">{t.subject}</h1>
      <p className="text-xs text-muted-foreground">Opened {new Date(t.created_at).toLocaleString()}</p>
    </div>
    <ol className="space-y-3">{messages.map((m) => <li key={m.id} className={`rounded-lg border border-border p-4 ${m.sender === 'staff' ? 'bg-accent' : 'bg-card'}`}>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{m.sender === 'staff' ? 'RoleProve support' : staff ? 'Customer' : 'You'} · {new Date(m.created_at).toLocaleString()}</p>
      <p className="whitespace-pre-wrap text-sm">{m.body}</p>
      {m.support_attachments?.map((a) => <button key={a.id} type="button" onClick={() => openAttachment(a.id)} className="mt-2 inline-flex items-center gap-1 text-sm text-primary underline"><Paperclip className="h-3 w-3" />{a.file_name}</button>)}
    </li>)}</ol>
    <section aria-label="Reply" className="space-y-3 border-t border-border pt-5">
      {t.status === 'resolved' && !staff && <p className="text-sm text-muted-foreground">This ticket is resolved. Replying will reopen it.</p>}
      <Label htmlFor="reply">Reply</Label>
      <Textarea id="reply" value={reply} maxLength={BODY_MAX} onChange={(e) => setReply(e.target.value)} rows={5} />
      {!staff && <div><Label htmlFor="reply-file" className="text-sm">Screenshot (optional, PNG/JPG, max 5 MB)</Label><Input id="reply-file" type="file" accept="image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={send} disabled={busy || reply.trim().length < 10}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send reply</Button>
        {t.status !== 'resolved' && <Button variant="outline" onClick={() => setStatus('resolved')}>Mark resolved</Button>}
        {staff && t.status === 'resolved' && <Button variant="outline" onClick={() => setStatus('open')}>Reopen</Button>}
      </div>
    </section>
  </div>;
}
