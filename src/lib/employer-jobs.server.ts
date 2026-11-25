import { reviewEmailSafe } from './staff-review.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { postingSchema, expiryProblem, postingFlags, reviewRequired, criticalEdit, dateAfter, type Posting, type PostingInput } from './employer-jobs';
import { membershipOf, accountKind, audit } from './employer-accounts.server';
import { checkApplicationLink } from './job-links.server';
type A = SupabaseClient;
const COLS = 'id,company_id,payload,practice_text,status,moderation_reason,views,apply_clicks,version,created_at';
const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

/** Read role through the caller's RLS client before loading an admin client in the RPC handler. */
export async function postingAccess(db: A, userId: string, write = false) {
  if (await accountKind(db, userId) !== 'employer') throw new Error('Employer accounts only.');
  const member = await membershipOf(db, userId);
  if (!member) throw new Error('Company membership required.');
  const { data: company, error } = await db.from('companies').select('id,name,website,email_domain,status,delete_after,review_every_posting,review_reset_at').eq('id', member.company_id).single();
  if (error || !company) throw new Error('Company unavailable.');
  if (write && (company.status !== 'approved' || company.delete_after)) throw new Error('Approved company required.');
  if (write && member.role !== 'owner' && member.role !== 'recruiter') throw new Error('Owners and recruiters only.');
  if (write) { const r = await db.rpc('can_post_company', { p_user: userId, p_company: company.id }); if (r.error || r.data !== true) throw new Error('Posting not permitted.'); }
  return { company, member };
}
export async function postingSettings(a: A) { const r = await a.from('app_settings').select('employer_job_review_count,employer_active_jobs,employer_daily_jobs,employer_job_retention_months,hiring_software_domains').eq('id', true).single(); fail(r.error); if (!r.data) throw new Error('Posting settings unavailable.'); return r.data; }
export async function reviewLevel(a: A, company: { id: string; review_every_posting: boolean; review_reset_at: string | null }) {
  const settings = await postingSettings(a);
  let q = a.from('employer_jobs').select('id', { head: true, count: 'exact' }).eq('company_id', company.id).eq('approved_once', true);
  if (company.review_reset_at) q = q.gt('approved_at', company.review_reset_at);
  const r = await q; fail(r.error);
  return { required: reviewRequired(company.review_every_posting, r.count ?? 0, settings.employer_job_review_count), approvals: r.count ?? 0, threshold: settings.employer_job_review_count, settings };
}
export async function listPostings(db: A, a: A, userId: string) {
  const access = await postingAccess(db, userId);
  const r = await db.from('employer_jobs').select(COLS).eq('company_id', access.company.id).order('created_at', { ascending: false }); fail(r.error);
  const level = await reviewLevel(a, access.company);
  return { rows: (r.data ?? []) as Posting[], company: { name: access.company.name as string, website: access.company.website as string }, canWrite: access.company.status === 'approved' && !access.company.delete_after && access.member.role !== 'viewer', review: level.required, approvals: level.approvals, threshold: level.threshold, activeLimit: level.settings.employer_active_jobs as number, dailyLimit: level.settings.employer_daily_jobs as number };
}
async function safeLink(url: string, checker = checkApplicationLink) { if (!(await checker(url))) throw new Error('The apply link could not be verified. Save a draft and try again later.'); }
async function flagsFor(a: A, input: PostingInput, company: { email_domain: string }, id?: string) {
  const s = await postingSettings(a);
  const r = await a.from('job_center_jobs').select('id,title,company,apply_url').eq('status', 'published').is('deleted_at', null).gte('expires_date', dateAfter(0)); fail(r.error);
  const normalize = (s: string) => { const u = new URL(s); u.hash = ''; for (const k of [...u.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(k)) u.searchParams.delete(k); return u.href.replace(/\/$/, ''); };
  const duplicate = (r.data ?? []).some(j => j.id !== id && normalize(j.apply_url) === normalize(input.apply_url) && j.title.toLowerCase() === input.title.toLowerCase());
  return postingFlags(input, company.email_domain, s.hiring_software_domains, duplicate);
}
export async function savePosting(db: A, a: A, userId: string, raw: unknown, id?: string, submit = false, checker = checkApplicationLink) {
  const { company } = await postingAccess(db, userId, true);
  const input = postingSchema.parse(raw); const expiry = expiryProblem(input.expires_date); if (expiry) throw new Error(expiry);
  let previous: Posting | null = null;
  if (id) { const r = await db.from('employer_jobs').select(COLS).eq('id', id).eq('company_id', company.id).single(); fail(r.error); previous = r.data as Posting | null; if (!previous) throw new Error('Job not found.'); }
  const { practice_text, ...payload } = input;
  const level = await reviewLevel(a, company);
  const flags = await flagsFor(a, input, company, id);
  let status: Posting['status'] = previous?.status ?? 'draft';
  const changedCritical = previous ? criticalEdit(previous.payload, payload) : false;
  if (submit || (status === 'published' && changedCritical)) {
    await safeLink(input.apply_url, checker);
    status = level.required || flags.length ? 'pending_review' : 'published';
  } else if (previous?.status === 'published' && flags.length) status = 'pending_review';
  const row = { company_id: company.id, payload, practice_text, status, flags, moderation_reason: '', ...(previous ? {} : { author_id: userId }) };
  const r = previous ? await a.from('employer_jobs').update(row).eq('id', previous.id).eq('company_id', company.id).eq('version', previous.version).select(COLS).single() : await a.from('employer_jobs').insert(row).select(COLS).single();
  fail(r.error); if (!r.data) throw new Error('Job changed. Reload and try again.');
  await event(a, company.id, r.data.id, userId, submit ? 'submit' : 'edit');
  if(status==='pending_review' && previous?.status!=='pending_review')await reviewEmailSafe(a);
  return r.data as Posting;
}
async function event(a: A, companyId: string, jobId: string, actorId: string, action: string, reason = '') { const r = await a.from('employer_job_events').insert({ company_id: companyId, job_id: jobId, actor_id: actorId, action, reason }); fail(r.error); }
export async function postingAction(db: A, a: A, userId: string, id: string, action: 'pause' | 'close' | 'renew' | 'duplicate' | 'resume', expiry?: string, checker = checkApplicationLink) {
  const { company } = await postingAccess(db, userId, true);
  const r = await db.from('employer_jobs').select(COLS).eq('id', id).eq('company_id', company.id).single(); fail(r.error); const j = r.data as Posting | null; if (!j) throw new Error('Job not found.');
  if (action === 'duplicate') return savePosting(db, a, userId, { ...j.payload, practice_text: j.practice_text, expires_date: dateAfter(30) }, undefined, false, checker);
  if (action === 'pause' && j.status !== 'published') throw new Error('Only published jobs can be paused.');
  if (action === 'resume' && j.status !== 'paused') throw new Error('Only paused jobs can be resumed.');
  if (action === 'renew') return savePosting(db, a, userId, { ...j.payload, practice_text: j.practice_text, expires_date: expiry ?? dateAfter(30) }, id, true, checker);
  let status: Posting['status'] = action === 'close' ? 'closed' : 'paused';
  if (action === 'resume') {
    const exp = expiryProblem(j.payload.expires_date); if (exp) throw new Error('Renew this expired job first.');
    await safeLink(j.payload.apply_url, checker);
    const level = await reviewLevel(a, company); const flags = await flagsFor(a, { ...j.payload, practice_text: j.practice_text }, company, id);
    status = level.required || flags.length ? 'pending_review' : 'published';
  }
  const upd = await a.from('employer_jobs').update({ status, moderation_reason: '' }).eq('id', id).eq('company_id', company.id).eq('version', j.version).select(COLS).single(); fail(upd.error);
  await event(a, company.id, id, userId, action); if(status==='pending_review'&&j.status!=='pending_review')await reviewEmailSafe(a); return upd.data as Posting;
}
export async function moderatePosting(a: A, staffId: string, id: string, action: 'approve' | 'reject' | 'unpublish', reason: string, checker = checkApplicationLink) {
  const staff = await a.rpc('is_support_staff', { _user_id: staffId }); if (staff.error || staff.data !== true) throw new Error('Staff only.');
  const r = await a.from('employer_jobs').select('*').eq('id', id).single(); fail(r.error); const j = r.data; if (!j) throw new Error('Job not found.');
  if (action !== 'approve' && !reason.trim()) throw new Error('A reason is required.');
  if ((action === 'approve' || action === 'reject') && j.status !== 'pending_review') throw new Error('Only pending jobs can be reviewed.');
  if (action === 'unpublish' && j.status !== 'published') throw new Error('Only published jobs can be unpublished.');
  if (action === 'approve') await safeLink(j.payload.apply_url, checker);
  const status = action === 'approve' ? 'published' : action === 'reject' ? 'draft' : 'closed';
  const update = await a.from('employer_jobs').update({ status, moderation_reason: action === 'approve' ? '' : reason.trim() }).eq('id', id).eq('version', j.version).select('id').single(); fail(update.error);
  if (action !== 'approve' && /scam|misleading/i.test(reason)) { const rr = await a.from('companies').update({ review_every_posting: true, review_reset_at: new Date().toISOString() }).eq('id', j.company_id); fail(rr.error); }
  await event(a, j.company_id, id, staffId, action, reason); await audit(a, j.company_id, staffId, 'staff', `job_${action}`, reason);
  return { ok: true };
}
export async function setPostingReview(a: A, staffId: string, companyId: string, every: boolean) {
  const staff = await a.rpc('is_support_staff', { _user_id: staffId }); if (staff.error || staff.data !== true) throw new Error('Staff only.');
  const r = await a.from('companies').update({ review_every_posting: every }).eq('id', companyId).select('id').single(); fail(r.error);
  await audit(a, companyId, staffId, 'staff', 'posting_review_changed', every ? 'Review every posting' : 'Use approval threshold'); return { ok: true };
}
export async function cleanEmployerJobs(a: A, now = Date.now(), companyId?: string) {
  const today = dateAfter(0, now); const s = await postingSettings(a);
  let query = a.from('employer_jobs').select('id,company_id,payload,status,terminal_at,expiring_notice_date').order('id'); if(companyId)query=query.eq('company_id',companyId);const r=await query; fail(r.error);
  let expired = 0, notices = 0, removed = 0;
  for (const j of r.data ?? []) {
    const expiry = j.payload.expires_date as string;
    if (expiry < today && !['closed', 'expired', 'draft'].includes(j.status)) { const u = await a.from('employer_jobs').update({ status: 'expired' }).eq('id', j.id).eq('status', j.status); fail(u.error); expired++; }
    else if (j.status === 'published' && expiry === dateAfter(3, now) && j.expiring_notice_date !== expiry) {
      const claim = await a.from('employer_jobs').update({ expiring_notice_date: expiry }).eq('id', j.id).or(`expiring_notice_date.is.null,expiring_notice_date.neq.${expiry}`).select('id'); fail(claim.error);
      if (claim.data?.length) { const members = await a.from('company_members').select('user_id').eq('company_id', j.company_id); fail(members.error); const { notify } = await import('./notifications.server');
        for (const m of members.data ?? []) await notify(a, { userId: m.user_id, type: 'account', title: 'Job expires in 3 days', body: j.payload.title, link: '/employer/jobs', relatedType: 'employer_job_expiry', relatedId: `${j.id}:${expiry}` }); notices++; }
    }
    const cutoff = new Date(now); cutoff.setUTCMonth(cutoff.getUTCMonth() - s.employer_job_retention_months);
    if (['closed', 'expired'].includes(j.status) && j.terminal_at && j.terminal_at < cutoff.toISOString()) {
      const t = await a.from('job_tracker').select('id', { head: true, count: 'exact' }).eq('job_id', j.id); fail(t.error);
      if (!t.count) { const d = await a.from('employer_jobs').delete().eq('id', j.id); fail(d.error); removed++; }
    }
  }
  return { expired, notices, removed };
}