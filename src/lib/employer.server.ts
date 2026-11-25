import type { SupabaseClient } from '@supabase/supabase-js';
import { getRequest } from '@tanstack/react-start/server';

export function origin() {
  const req = getRequest();
  const url = new URL(req.url);
  const sandboxHost = url.hostname === 'localhost' ? req.headers.get('x-forwarded-host') : null;
  return sandboxHost ? `https://${sandboxHost}` : url.origin;
}
/** Random URL-safe token; only its SHA-256 is stored, so a database copy can't be used to click links. */
export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function hashToken(token: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(d)).map(x => x.toString(16).padStart(2, '0')).join('');
}
/** Keyed visitor-address hash — same HMAC function and key as portfolio reports. */
export async function visitorHash(admin: SupabaseClient): Promise<string> {
  const req = getRequest();
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const { data, error } = await admin.rpc('portfolio_report_ip_hash', { p_ip: ip });
  if (error || typeof data !== 'string') throw new Error('Something went wrong. Please try again.');
  return data;
}
export const RATE_LIMITS = { waitlist: 5, link: 5, submit: 10, remove: 20 } as const;
/** Per-address hourly limit. Returns false when the limit is reached (and records nothing). */
export async function rateHit(admin: SupabaseClient, kind: keyof typeof RATE_LIMITS): Promise<boolean> {
  const h = await visitorHash(admin);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error } = await admin.from('employer_rate_hits').select('id', { count: 'exact', head: true }).eq('kind', kind).eq('ip_hash', h).gte('created_at', since);
  if (error) throw new Error('Something went wrong. Please try again.');
  if ((count ?? 0) >= RATE_LIMITS[kind]) return false;
  const { error: e } = await admin.from('employer_rate_hits').insert({ kind, ip_hash: h });
  if (e) throw new Error('Something went wrong. Please try again.');
  return true;
}
export async function employerSettings(admin: SupabaseClient) {
  const { data, error } = await admin.from('app_settings').select('employer_daily_submissions,employer_max_pending,employer_unconfirmed_days,employer_pending_days,employer_rejected_days,employer_contact_days,employer_waitlist_max_months,hiring_software_domains').eq('id', true).single();
  if (error || !data) throw new Error('Settings unavailable.');
  return data;
}
/** A confirmed, unexpired submission session (24h from confirmation). */
export async function activeSession(admin: SupabaseClient, token: string) {
  const { data } = await admin.from('employer_sessions').select('id,email,confirmed_at,expires_at').eq('token_hash', await hashToken(token)).maybeSingle();
  if (!data?.confirmed_at || !data.expires_at || new Date(data.expires_at) < new Date()) return null;
  return data;
}
const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

/** Hourly cleanup for employer data. All periods come from app_settings. */
export async function cleanEmployerData(admin: SupabaseClient) {
  const s = await employerSettings(admin);
  const out = { waitlistUnconfirmed: 0, waitlistOld: 0, sessions: 0, pendingJobs: 0, rejectedJobs: 0, contactsCleared: 0 };
  const del = async (q: PromiseLike<{ data: unknown[] | null; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data?.length ?? 0; };
  out.waitlistUnconfirmed = await del(admin.from('employer_waitlist').delete().is('confirmed_at', null).lt('created_at', ago(s.employer_unconfirmed_days)).select('id'));
  if (s.employer_waitlist_max_months) out.waitlistOld = await del(admin.from('employer_waitlist').delete().not('confirmed_at', 'is', null).lt('confirmed_at', ago(s.employer_waitlist_max_months * 30)).select('id'));
  out.sessions = await del(admin.from('employer_sessions').delete().is('confirmed_at', null).lt('created_at', ago(s.employer_unconfirmed_days)).select('id'));
  out.sessions += await del(admin.from('employer_sessions').delete().lt('expires_at', new Date().toISOString()).select('id'));
  await del(admin.from('employer_rate_hits').delete().lt('created_at', ago(1)).select('id'));
  const { data: jobs, error } = await admin.from('job_center_jobs').select('id,status,created_at,expires_date,deleted_at,job_center_private(reviewed_at,submitter_email)').eq('source_type', 'employer_submitted').limit(1000);
  if (error) throw error;
  const today = new Date().toISOString().slice(0, 10);
  const pendingIds: string[] = [], rejectedIds: string[] = [], contactIds: string[] = [];
  for (const j of jobs ?? []) {
    const p = Array.isArray(j.job_center_private) ? j.job_center_private[0] : j.job_center_private;
    if (j.status === 'pending_review' && !p?.reviewed_at && j.created_at < ago(s.employer_pending_days)) pendingIds.push(j.id);
    else if (j.status === 'rejected' && (p?.reviewed_at ?? j.created_at) < ago(s.employer_rejected_days)) rejectedIds.push(j.id);
    else if (p?.submitter_email && ((j.deleted_at && j.deleted_at < ago(s.employer_contact_days)) || j.expires_date < new Date(Date.now() - s.employer_contact_days * 86400000).toISOString().slice(0, 10) && j.expires_date < today)) contactIds.push(j.id);
  }
  // Never-published jobs have no trackers, so they can be removed outright (private row cascades).
  if (pendingIds.length) out.pendingJobs = await del(admin.from('job_center_jobs').delete().in('id', pendingIds).select('id'));
  if (rejectedIds.length) out.rejectedJobs = await del(admin.from('job_center_jobs').delete().in('id', rejectedIds).select('id'));
  if (contactIds.length) out.contactsCleared = await del(admin.from('job_center_private').update({ submitter_name: '', submitter_email: '', removal_token_hash: null }).in('job_id', contactIds).select('job_id'));
  return out;
}

/** Sends the approved/rejected email with a fresh removal link (only its hash is stored). Server-only helper. */
export async function notifySubmitter(a: SupabaseClient, jobId: string, kind: 'approved' | 'rejected') {
  const { data: j } = await a.from('job_center_jobs').select('title,company,expires_date,source_type,job_center_private(submitter_email,reject_reason,reject_note)').eq('id', jobId).single();
  const p = j && (Array.isArray(j.job_center_private) ? j.job_center_private[0] : j.job_center_private);
  if (!j || j.source_type !== 'employer_submitted' || !p?.submitter_email) return;
  const token = newToken();
  await a.from('job_center_private').update({ removal_token_hash: await hashToken(token) }).eq('job_id', jobId);
  const removeUrl = `${origin()}/employers/remove?token=${token}`;
  const { sendTemplateEmail } = await import('@/lib/email-templates/send-email');
  await sendTemplateEmail(kind === 'approved' ? 'employer-job-approved' : 'employer-job-rejected', p.submitter_email,
    { templateData: kind === 'approved' ? { title: j.title, company: j.company, expires: j.expires_date, removeUrl } : { title: j.title, company: j.company, reason: p.reject_reason, note: p.reject_note, removeUrl }, idempotencyKey: `employer-${kind}-${jobId}` },
  ).then(()=>undefined);
}

