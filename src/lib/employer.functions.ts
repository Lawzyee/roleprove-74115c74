import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { absoluteUrl } from './site-url';
import { waitlistSchema, workEmailSchema, employerJobSchema, isPersonalEmail, submissionLimitProblem, REJECT_REASONS, WAITLIST_MESSAGE, type WaitlistInput } from './employer';

const admin = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin;
const server = () => import('./employer.server');
const send = async (template: string, to: string, data: Record<string, unknown>, key: string) => {
  const { sendTemplateEmail } = await import('@/lib/email-templates/send-email');
  return sendTemplateEmail(template, to, { templateData: data, idempotencyKey: key });
};
const tokenInput = z.object({ token: z.string().min(20).max(200) });
const LIMITED = 'Too many requests from your connection. Please try again in an hour.';

/** Creates or refreshes an unconfirmed waitlist entry and sends the double opt-in email. Same answer either way. */
async function addToWaitlist(v: Omit<WaitlistInput, 'consent' | 'website'>) {
  const a = await admin(); const s = await server();
  const { data: existing } = await a.from('employer_waitlist').select('id,confirmed_at').eq('email', v.email).maybeSingle();
  if (existing?.confirmed_at) return; // already confirmed: say nothing different
  const confirm = s.newToken(), remove = s.newToken();
  const row = { ...v, personal_email: isPersonalEmail(v.email), confirm_token_hash: await s.hashToken(confirm), remove_token_hash: await s.hashToken(remove), consent_at: new Date().toISOString() };
  const { data, error } = existing
    ? await a.from('employer_waitlist').update(row).eq('id', existing.id).select('id').single()
    : await a.from('employer_waitlist').insert(row).select('id').single();
  if (error || !data) throw new Error('Could not join the waitlist. Please try again.');
  await send('employer-waitlist-confirm', v.email, { name: v.full_name, confirmUrl: absoluteUrl('/employers/confirm', { token: confirm }), removeUrl: absoluteUrl('/employers/leave', { token: remove }) }, `waitlist-confirm-${data.id}-${row.confirm_token_hash.slice(0, 12)}`);
}

export const joinWaitlistFn = createServerFn({ method: 'POST' }).inputValidator((d: unknown) => waitlistSchema.parse(d)).handler(async ({ data }) => {
  if (data.website) return { ok: true as const, message: WAITLIST_MESSAGE }; // honeypot
  const s = await server();
  if (!(await s.rateHit(await admin(), 'waitlist'))) return { error: LIMITED };
  const { consent: _c, website: _w, ...v } = data;
  try { await addToWaitlist(v); } catch (e) { console.error('waitlist', e); return { error: 'Could not join the waitlist. Please try again.' }; }
  return { ok: true as const, message: WAITLIST_MESSAGE };
});
export const confirmWaitlistFn = createServerFn({ method: 'POST' }).inputValidator((d: unknown) => tokenInput.parse(d)).handler(async ({ data }) => {
  const a = await admin(); const s = await server();
  const { data: rows, error } = await a.from('employer_waitlist').update({ confirmed_at: new Date().toISOString(), confirm_token_hash: null }).eq('confirm_token_hash', await s.hashToken(data.token)).is('confirmed_at', null).select('id');
  if (error || !rows?.length) return { ok: false as const };
  return { ok: true as const };
});
export const leaveWaitlistFn = createServerFn({ method: 'POST' }).inputValidator((d: unknown) => tokenInput.parse(d)).handler(async ({ data }) => {
  const a = await admin(); const s = await server();
  if (!(await s.rateHit(a, 'remove'))) return { error: LIMITED };
  const { error } = await a.from('employer_waitlist').delete().eq('remove_token_hash', await s.hashToken(data.token));
  if (error) return { error: 'Could not remove you. Please email support@roleprove.com.' };
  return { ok: true as const }; // same answer if already removed
});

/** Step 1 of listing a job: work email only (personal domains refused), then a confirmation link. */
export const requestSubmitLinkFn = createServerFn({ method: 'POST' }).inputValidator((d: unknown) => workEmailSchema.parse(d)).handler(async ({ data }) => {
  if (data.website) return { ok: true as const };
  if (isPersonalEmail(data.email)) return { error: 'Please use your work email address (for example you@yourcompany.com). We can\u2019t accept job listings from personal email addresses like Gmail or Outlook, because the company email helps candidates trust the listing.' };
  const a = await admin(); const s = await server();
  if (!(await s.rateHit(a, 'link'))) return { error: LIMITED };
  const token = s.newToken(); const hash = await s.hashToken(token);
  const { data: row, error } = await a.from('employer_sessions').insert({ email: data.email, token_hash: hash }).select('id').single();
  if (error || !row) return { error: 'Could not send the link. Please try again.' };
  try { await send('employer-submit-link', data.email, { submitUrl: absoluteUrl('/employers/submit', { token }) }, `employer-link-${row.id}`); }
  catch (e) { console.error('employer link', e); return { error: 'Could not send the link. Please try again.' }; }
  return { ok: true as const };
});
/** Opening the link confirms the email and starts a 24-hour session for that email only. */
export const openSubmitSessionFn = createServerFn({ method: 'POST' }).inputValidator((d: unknown) => tokenInput.parse(d)).handler(async ({ data }) => {
  const a = await admin(); const s = await server();
  const hash = await s.hashToken(data.token);
  const { data: row } = await a.from('employer_sessions').select('id,email,confirmed_at,expires_at').eq('token_hash', hash).maybeSingle();
  if (!row) return { ok: false as const };
  if (!row.confirmed_at) {
    const now = new Date();
    const { data: upd, error } = await a.from('employer_sessions').update({ confirmed_at: now.toISOString(), expires_at: new Date(now.getTime() + 86400000).toISOString() }).eq('id', row.id).is('confirmed_at', null).select('email,expires_at').single();
    if (error || !upd) return { ok: false as const };
    return { ok: true as const, email: upd.email, expiresAt: upd.expires_at as string };
  }
  if (!row.expires_at || new Date(row.expires_at) < new Date()) return { ok: false as const, expired: true };
  return { ok: true as const, email: row.email, expiresAt: row.expires_at };
});

export const submitEmployerJobFn = createServerFn({ method: 'POST' }).inputValidator((d: unknown) => employerJobSchema().parse(d)).handler(async ({ data }) => {
  if (data.website) return { ok: true as const };
  const a = await admin(); const s = await server();
  const session = await s.activeSession(a, data.token);
  if (!session) return { error: 'This link has expired. Please request a new confirmation link from the For employers page.' };
  if (!(await s.rateHit(a, 'submit'))) return { error: LIMITED };
  const settings = await s.employerSettings(a);
  const { data: mine, error: mErr } = await a.from('job_center_private').select('job_id,job_center_jobs!inner(status,created_at)').eq('submitter_email', session.email);
  if (mErr) return { error: 'Could not submit the job. Please try again.' };
  const midnight = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
  const jobsOf = (mine ?? []).map(r => (Array.isArray(r.job_center_jobs) ? r.job_center_jobs[0] : r.job_center_jobs) as { status: string; created_at: string });
  const problem = submissionLimitProblem(jobsOf.filter(j => j.created_at >= midnight).length, jobsOf.filter(j => j.status === 'pending_review').length, { daily: settings.employer_daily_submissions, pending: settings.employer_max_pending });
  if (problem) return { error: problem };
  const today = new Date().toISOString().slice(0, 10);
  const { data: job, error } = await a.from('job_center_jobs').insert({
    title: data.title, company: data.company, company_website: data.company_website || null, city: data.city, country: data.country,
    arrangement: data.arrangement, employment: data.employment, role_key: data.role_key, other_role: data.role_key === 'other' ? data.other_role : '', seniority: data.seniority,
    salary_currency: data.salary_currency, salary_min: data.salary_min, salary_max: data.salary_max, salary_period: data.salary_period,
    summary: data.summary, apply_url: data.apply_url, posted_date: today, expires_date: data.expires_date,
    status: 'pending_review', source_type: 'employer_submitted',
  }).select('id').single();
  if (error || !job) return { error: 'Could not submit the job. Please try again.' };
  const { error: pErr } = await a.from('job_center_private').insert({ job_id: job.id, practice_text: data.practice_consent ? data.practice_text : '', submitter_name: data.submitter_name, submitter_email: session.email, source_note: 'Submitted via the For employers page.' });
  if (pErr) { await a.from('job_center_jobs').delete().eq('id', job.id); return { error: 'Could not submit the job. Please try again.' }; }
  if (data.join_waitlist) {
    try { await addToWaitlist({ full_name: data.submitter_name, email: session.email, company: data.company, job_title: '', company_size: null, country: data.country, roles: [data.role_key], other_role: data.role_key === 'other' ? data.other_role : '', hiring_types: [], arrangements: [data.arrangement], hires_per_year: null, message: '' }); }
    catch (e) { console.error('waitlist from submission', e); }
  }
  return { ok: true as const };
});

/** One click, no sign-in: takes the listing down immediately. */
export const removeListingFn = createServerFn({ method: 'POST' }).inputValidator((d: unknown) => tokenInput.parse(d)).handler(async ({ data }) => {
  const a = await admin(); const s = await server();
  if (!(await s.rateHit(a, 'remove'))) return { error: LIMITED };
  const { data: p } = await a.from('job_center_private').select('job_id').eq('removal_token_hash', await s.hashToken(data.token)).maybeSingle();
  if (!p) return { error: 'This removal link is not valid, or the listing was already deleted.' };
  const { error } = await a.from('job_center_jobs').update({ status: 'hidden', deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', p.job_id).is('deleted_at', null);
  if (error) return { error: 'Could not remove the listing. Please email support@roleprove.com.' };
  return { ok: true as const };
});

// ---------- Staff only ----------
async function requireStaff(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc('is_support_staff', { _user_id: context.userId });
  if (error || data !== true) throw new Error('Staff only.');
}
export const rejectJobFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), reason: z.enum(REJECT_REASONS), note: z.string().trim().max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const existing = await context.supabase.from('job_center_jobs').select('source_type').eq('id', data.id).single();
    if (existing.data?.source_type === 'employer_account') throw new Error('Use the employer posting review controls.');
    const { data: rows, error } = await context.supabase.from('job_center_jobs').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', data.id).eq('status', 'pending_review').select('id');
    if (error || !rows?.length) throw new Error('Only jobs waiting for review can be rejected.');
    const { error: p } = await context.supabase.from('job_center_private').update({ reject_reason: data.reason, reject_note: data.note, reviewed_at: new Date().toISOString() }).eq('job_id', data.id);
    if (p) throw new Error('Could not save the rejection reason.');
    let emailed = true; try { await (await server()).notifySubmitter(await admin(), data.id, 'rejected'); } catch (e) { console.error('reject email', e); emailed = false; }
    return { ok: true, emailed };
  });
export const getWaitlistFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireStaff(context);
  // Read through row-level security: only support staff can select these rows.
  const { data, error } = await context.supabase.from('employer_waitlist').select('id,full_name,email,company,job_title,company_size,country,roles,other_role,hiring_types,arrangements,hires_per_year,message,personal_email,confirmed_at,created_at').order('created_at', { ascending: false });
  if (error) throw new Error('Could not load the waitlist.');
  return { rows: data ?? [] };
});
export const getHiringDomainsFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireStaff(context);
  const { employerSettings } = await server();
  return { domains: (await employerSettings(await admin())).hiring_software_domains as string[] };
});
export const saveHiringDomainsFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ domains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Enter domains like greenhouse.io')).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { error } = await (await admin()).from('app_settings').update({ hiring_software_domains: [...new Set(data.domains)] }).eq('id', true);
    if (error) throw new Error('Could not save the list.');
    return { ok: true };
  });
