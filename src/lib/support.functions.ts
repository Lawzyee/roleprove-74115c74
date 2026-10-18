import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  BODY_MAX, BODY_MIN, SUBJECT_MAX, SUBJECT_MIN, TICKETS_PER_HOUR,
  checkAttachment, statusAfterMessage, tagsFor,
} from './support';

const attachment = z.object({ path: z.string().min(1).max(300), name: z.string().min(1).max(200) }).optional();
const body = z.string().trim().min(BODY_MIN, `Message must be at least ${BODY_MIN} characters.`).max(BODY_MAX, `Message must be at most ${BODY_MAX} characters.`);

type Supa = { rpc: (fn: 'is_support_staff', args: { _user_id: string }) => PromiseLike<{ data: boolean | null; error: unknown }> };
async function isStaff(supabase: unknown, userId: string) {
  const { data, error } = await (supabase as Supa).rpc('is_support_staff', { _user_id: userId });
  if (error) throw new Error('Could not check support access.');
  return data === true;
}

// Uploads go directly to the user's private folder; re-check the stored object's real type and size before linking it.
async function verifyAttachment(userId: string, file: { path: string; name: string }) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const parts = file.path.split('/');
  if (parts.length !== 2 || parts[0] !== userId || !parts[1] || file.path.includes('..')) throw new Error('Invalid screenshot.');
  const { data, error } = await supabaseAdmin.storage.from('support-attachments').list(userId, { search: parts[1], limit: 5 });
  if (error) throw new Error('Could not check the screenshot.');
  const object = data?.find((o) => o.name === parts[1]);
  if (!object) throw new Error('Screenshot upload not found. Please attach it again.');
  const meta = (object.metadata ?? {}) as { mimetype?: string; size?: number };
  const problem = checkAttachment(meta.mimetype ?? '', Number(meta.size ?? Infinity));
  if (problem) {
    await supabaseAdmin.storage.from('support-attachments').remove([file.path]);
    throw new Error(problem);
  }
}

export const createTicketFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    category: z.enum(['billing', 'scoring_dispute', 'technical', 'data_request', 'other']),
    subject: z.string().trim().min(SUBJECT_MIN, `Subject must be at least ${SUBJECT_MIN} characters.`).max(SUBJECT_MAX, `Subject must be at most ${SUBJECT_MAX} characters.`),
    body, attemptId: z.string().uuid().optional(), dataRequest: z.enum(['export', 'delete']).optional(), attachment,
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error: countError } = await supabaseAdmin.from('support_tickets').select('id', { count: 'exact', head: true }).eq('user_id', context.userId).gte('created_at', since);
    if (countError) throw new Error('Could not create the ticket.');
    if ((count ?? 0) >= TICKETS_PER_HOUR) return { error: `You can open up to ${TICKETS_PER_HOUR} tickets per hour. Please reply to an existing ticket or try again later.` };
    let attemptId: string | null = null;
    if (data.attemptId) {
      const { data: attempt } = await context.supabase.from('simulation_attempts').select('id').eq('id', data.attemptId).eq('user_id', context.userId).maybeSingle();
      if (!attempt) return { error: 'That attempt could not be found on your account.' };
      attemptId = attempt.id;
    }
    if (data.category === 'scoring_dispute' && !attemptId) return { error: 'Open a dispute from the attempt results page so the attempt is attached.' };
    if (data.category === 'data_request' && !data.dataRequest) return { error: 'Choose export or delete for a data request.' };
    if (data.attachment) await verifyAttachment(context.userId, data.attachment);
    const { data: ticket, error } = await supabaseAdmin.from('support_tickets').insert({
      user_id: context.userId, category: data.category, subject: data.subject, attempt_id: attemptId,
      data_request: data.category === 'data_request' ? data.dataRequest ?? null : null, tags: tagsFor(data.category),
    }).select('id').single();
    if (error || !ticket) throw new Error('Could not create the ticket.');
    const { data: message, error: msgError } = await supabaseAdmin.from('support_messages').insert({ ticket_id: ticket.id, sender: 'user', body: data.body }).select('id').single();
    if (msgError || !message) { await supabaseAdmin.from('support_tickets').delete().eq('id', ticket.id); throw new Error('Could not create the ticket.'); }
    if (data.attachment) await supabaseAdmin.from('support_attachments').insert({ message_id: message.id, file_path: data.attachment.path, file_name: data.attachment.name });
    return { ticketId: ticket.id };
  });

export const replyTicketFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ ticketId: z.string().uuid(), body, attachment }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    // RLS read decides visibility: owners see their tickets, staff see all.
    const { data: ticket } = await context.supabase.from('support_tickets').select('id, user_id').eq('id', data.ticketId).maybeSingle();
    if (!ticket) return { error: 'Ticket not found.' };
    const staff = ticket.user_id !== context.userId && await isStaff(context.supabase, context.userId);
    if (ticket.user_id !== context.userId && !staff) return { error: 'Ticket not found.' };
    const sender = staff ? 'staff' as const : 'user' as const;
    if (data.attachment) {
      if (staff) return { error: 'Staff replies cannot include screenshots.' };
      await verifyAttachment(context.userId, data.attachment);
    }
    const { data: message, error } = await supabaseAdmin.from('support_messages').insert({ ticket_id: ticket.id, sender, body: data.body }).select('id').single();
    if (error || !message) throw new Error('Could not send the reply.');
    if (data.attachment) await supabaseAdmin.from('support_attachments').insert({ message_id: message.id, file_path: data.attachment.path, file_name: data.attachment.name });
    const now = new Date().toISOString();
    await supabaseAdmin.from('support_tickets').update({ status: statusAfterMessage(sender), updated_at: now, ...(staff ? { staff_last_read_at: now } : { user_last_read_at: now }) }).eq('id', ticket.id);
    return { ok: true as const };
  });

export const setTicketStatusFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ ticketId: z.string().uuid(), status: z.enum(['open', 'replied', 'resolved']) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: ticket } = await context.supabase.from('support_tickets').select('id, user_id').eq('id', data.ticketId).maybeSingle();
    if (!ticket) return { error: 'Ticket not found.' };
    const owner = ticket.user_id === context.userId;
    if (!owner && !(await isStaff(context.supabase, context.userId))) return { error: 'Ticket not found.' };
    if (owner && data.status !== 'resolved' && !(await isStaff(context.supabase, context.userId))) return { error: 'Reply to reopen this ticket.' };
    await supabaseAdmin.from('support_tickets').update({ status: data.status, updated_at: new Date().toISOString() }).eq('id', ticket.id);
    return { ok: true as const };
  });

export const markTicketReadFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ ticketId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: ticket } = await context.supabase.from('support_tickets').select('id, user_id').eq('id', data.ticketId).maybeSingle();
    if (!ticket) return { ok: false };
    const now = new Date().toISOString();
    await supabaseAdmin.from('support_tickets').update(ticket.user_id === context.userId ? { user_last_read_at: now } : { staff_last_read_at: now }).eq('id', ticket.id);
    return { ok: true };
  });

export const getAttachmentUrlFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ attachmentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from('support_attachments').select('file_path').eq('id', data.attachmentId).maybeSingle();
    if (!row) return { error: 'Screenshot not found.' };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: signed, error } = await supabaseAdmin.storage.from('support-attachments').createSignedUrl(row.file_path, 600);
    if (error || !signed) return { error: 'Could not open the screenshot.' };
    return { url: signed.signedUrl };
  });

export const getIsSupportStaffFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ staff: await isStaff(context.supabase, context.userId) }));

// Staff-only: the attempt's scores and justifications, nothing else from the account.
export const getDisputeAttemptFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ ticketId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    if (!(await isStaff(context.supabase, context.userId))) return { error: 'Support staff only.' };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: ticket } = await supabaseAdmin.from('support_tickets').select('attempt_id').eq('id', data.ticketId).maybeSingle();
    if (!ticket?.attempt_id) return { error: 'No attempt attached.' };
    const { data: attempt } = await supabaseAdmin.from('simulation_attempts').select('id, status, overall_score, pillar_scores, completed_at, simulation_type, simulations(title)').eq('id', ticket.attempt_id).maybeSingle();
    if (!attempt) return { error: 'The attempt no longer exists.' };
    const { data: results } = await supabaseAdmin.from('attempt_task_results').select('id, score, max_score, feedback, criteria_breakdown, pillar, simulation_tasks(title, order)').eq('attempt_id', attempt.id);
    return { attempt: JSON.parse(JSON.stringify(attempt)) as Record<string, unknown>, results: JSON.parse(JSON.stringify(results ?? [])) as Record<string, unknown>[] };
  });
