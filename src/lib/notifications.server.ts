import type { SupabaseClient } from '@supabase/supabase-js';
import { BODY_MAX, TITLE_MAX, isInternalPath, type NotificationType } from './notifications';

export const APP_ORIGIN = 'https://roleprove.com';
type Input = { userId: string; type: NotificationType; title: string; body?: string; link: string; relatedType: string; relatedId: string };
type RpcResult = { created: boolean; id?: string; email?: boolean; reason?: string };

async function emailOne(admin: SupabaseClient, id: string, userId: string) {
  const { data: profile } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
  if (profile?.email) {
    const { sendTemplateEmail } = await import('./email-templates/send-email');
    await sendTemplateEmail('new-notification', profile.email, { idempotencyKey: `notification-${id}`, templateData: { url: `${APP_ORIGIN}/inbox` } });
  }
  await admin.from('notifications').update({ email_pending: false }).eq('id', id);
}

/** The only app path that creates notifications. Duplicate guard, hourly limit and email preference live in public.create_notification. */
export async function notify(admin: SupabaseClient, n: Input): Promise<RpcResult> {
  if (!isInternalPath(n.link)) return { created: false, reason: 'bad_link' };
  const { data, error } = await admin.rpc('create_notification', {
    p_user: n.userId, p_type: n.type, p_title: n.title.slice(0, TITLE_MAX), p_body: (n.body ?? '').slice(0, BODY_MAX),
    p_link: n.link, p_related_type: n.relatedType, p_related_id: n.relatedId,
  });
  if (error) { console.error('notify', error.message); return { created: false, reason: 'error' }; }
  const r = data as RpcResult;
  if (r.created && r.email && r.id) await emailOne(admin, r.id, n.userId).catch((e) => console.error('notify email', e));
  return r;
}

/** Never throws into the caller's main action. */
export async function notifySafe(n: Input) {
  try { const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); return await notify(supabaseAdmin, n); }
  catch (e) { console.error('notify', e); return { created: false, reason: 'error' }; }
}

/** Hourly: emails for notifications made by database triggers (saved jobs closing) or earlier failed sends. */
export async function sendPendingEmails(admin: SupabaseClient) {
  const { data, error } = await admin.from('notifications').select('id,user_id').eq('email_pending', true).limit(500);
  if (error) throw error;
  let sent = 0;
  for (const r of data ?? []) { try { await emailOne(admin, r.id, r.user_id); sent++; } catch (e) { console.error('pending email', e); } }
  return sent;
}

/** Hourly: read notifications after N days, all after M days (app_settings). */
export async function cleanNotifications(admin: SupabaseClient, now = Date.now()) {
  const { data: s } = await admin.from('app_settings').select('notification_read_retention_days,notification_retention_days').limit(1).maybeSingle();
  const readDays = s?.notification_read_retention_days ?? 90, allDays = s?.notification_retention_days ?? 180;
  const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();
  const a = await admin.from('notifications').delete({ count: 'exact' }).not('read_at', 'is', null).lt('read_at', ago(readDays));
  if (a.error) throw a.error;
  const b = await admin.from('notifications').delete({ count: 'exact' }).lt('created_at', ago(allDays));
  if (b.error) throw b.error;
  return (a.count ?? 0) + (b.count ?? 0);
}
