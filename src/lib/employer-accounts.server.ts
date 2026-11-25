// Server-only: employer accounts, companies, team, staff review, cleanup and erasure steps.
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailDomain, baseDomain } from './employer';
import { newToken, hashToken } from './employer.server';
import { absoluteUrl } from './site-url';
import {
  companyAccess, deletionProblem, inviteExpired, inviteProblem, transitionProblem, verificationLevels, websiteMatchesDomain, TRANSITIONS,
  type CompanyInput, type CompanyStatus, type MemberRole, type StaffAction,
} from './employer-accounts';

type A = SupabaseClient;
type Opts = { email?: boolean };
const COMPANY_COLS = 'id,name,website,email_domain,country,size_band,industry,description,registration_number,public_page_url,status,status_reason,reviewed_at,created_at,updated_at';
const fail = (msg: string): never => { throw new Error(msg); };

export async function accountSettings(a: A) {
  const { data, error } = await a.from('app_settings').select('personal_email_domains,disposable_email_domains,employer_max_seats,company_delete_notice_days,employer_invite_days,employer_unconfirmed_days,employer_rejected_days').eq('id', true).single();
  if (error || !data) throw new Error('Settings unavailable.');
  return data;
}
export async function accountKind(a: A, userId: string): Promise<'candidate' | 'employer' | null> {
  const { data } = await a.from('account_types').select('kind').eq('user_id', userId).maybeSingle();
  return (data?.kind as 'candidate' | 'employer' | undefined) ?? null;
}
export async function membershipOf(a: A, userId: string): Promise<{ company_id: string; role: MemberRole } | null> {
  const { data, error } = await a.from('company_members').select('company_id,role').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('Could not load your company.');
  return (data as { company_id: string; role: MemberRole } | null) ?? null;
}
export async function audit(a: A, companyId: string, actorId: string | null, actorKind: 'staff' | 'employer' | 'system', action: string, reason = '') {
  const { data, error } = await a.from('company_audit_log').insert({ company_id: companyId, actor_id: actorId, actor_kind: actorKind, action, reason: reason.slice(0, 1000) }).select('id').single();
  if (error || !data) throw new Error('Could not write the audit log.');
  return data.id as string;
}
async function authUser(a: A, userId: string) {
  const { data, error } = await a.auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error('Account not found.');
  return data.user;
}
async function requireEmployer(a: A, userId: string) {
  if ((await accountKind(a, userId)) !== 'employer') fail('This is only for employer accounts.');
}
async function loadCompany(a: A, id: string) {
  const { data, error } = await a.from('companies').select(COMPANY_COLS).eq('id', id).single();
  if (error || !data) throw new Error('Company not found.');
  return data as typeof data & { status: CompanyStatus };
}
async function ownerOf(a: A, companyId: string) {
  const { data } = await a.from('company_members').select('user_id').eq('company_id', companyId).eq('role', 'owner').maybeSingle();
  return data?.user_id as string | undefined;
}
/** Member of an approved company (or owner-only when ownerOnly). Re-checked on every call, so removal takes effect at once. */
async function requireMember(a: A, userId: string, { ownerOnly = false, full = true } = {}) {
  await requireEmployer(a, userId);
  const m = await membershipOf(a, userId);
  if (!m) fail('You are not a member of a company.');
  const company = await loadCompany(a, m!.company_id);
  if (ownerOnly && m!.role !== 'owner') fail('Only the company owner can do this.');
  if (full && !companyAccess(company.status).full) fail('This is available once RoleProve has reviewed your company.');
  return { member: m!, company };
}
async function seatsUsed(a: A, companyId: string) {
  const [m, i] = await Promise.all([
    a.from('company_members').select('user_id', { count: 'exact', head: true }).eq('company_id', companyId),
    a.from('company_invites').select('id', { count: 'exact', head: true }).eq('company_id', companyId).is('accepted_at', null).gt('expires_at', new Date().toISOString()),
  ]);
  return { members: m.count ?? 0, used: (m.count ?? 0) + (i.count ?? 0) };
}
async function sendEmail(template: string, to: string, data: Record<string, unknown>, key: string) {
  const { sendTemplateEmail } = await import('./email-templates/send-email');
  return sendTemplateEmail(template, to, { templateData: data, idempotencyKey: key });
}
async function notifyUser(a: A, userId: string, title: string, body: string, relatedId: string) {
  const { notify } = await import('./notifications.server');
  return notify(a, { userId, type: 'account', title, body, link: '/employer', relatedType: 'company', relatedId });
}

// ---------- Employer side ----------
export async function getEmployerState(a: A, userId: string) {
  const user = await authUser(a, userId);
  const kind = await accountKind(a, userId);
  const domain = emailDomain(user.email ?? '');
  const confirmed = Boolean(user.email_confirmed_at);
  const member = await membershipOf(a, userId);
  if (member) {
    const company = await loadCompany(a, member.company_id);
    const ownerId = await ownerOf(a, company.id);
    const owner = ownerId ? await authUser(a, ownerId).catch(() => null) : null;
    return { kind, email: user.email ?? '', domain, member, company, levels: verificationLevels(company, Boolean(owner?.email_confirmed_at)), access: companyAccess(company.status), domainCompany: null, joinRequested: false, invites: [] as Array<{ id: string; company: string; role: string; expires_at: string }> };
  }
  const [{ data: dc }, { data: jr }, { data: inv }] = await Promise.all([
    a.from('companies').select('id,name,status').eq('email_domain', domain).maybeSingle(),
    a.from('company_join_requests').select('id').eq('user_id', userId).maybeSingle(),
    a.from('company_invites').select('id,role,expires_at,companies(name)').eq('email', (user.email ?? '').toLowerCase()).is('accepted_at', null).gt('expires_at', new Date().toISOString()),
  ]);
  return {
    kind, email: user.email ?? '', domain, member: null, company: null, levels: [] as string[], access: companyAccess('pending'),
    domainCompany: dc ? { name: dc.name as string } : null, joinRequested: Boolean(jr), confirmed,
    invites: (inv ?? []).map((i) => ({ id: i.id as string, role: i.role as string, expires_at: i.expires_at as string, company: ((Array.isArray(i.companies) ? i.companies[0] : i.companies) as { name: string } | null)?.name ?? 'A company' })),
  };
}

export async function createCompany(a: A, userId: string, input: CompanyInput) {
  await requireEmployer(a, userId);
  const user = await authUser(a, userId);
  if (!user.email_confirmed_at) fail('Please confirm your email first.');
  if (await membershipOf(a, userId)) fail('You already belong to a company.');
  const domain = emailDomain(user.email ?? '');
  const { data: existing } = await a.from('companies').select('id').eq('email_domain', domain).maybeSingle();
  if (existing) return { join: true as const };
  const { data: c, error } = await a.from('companies').insert({ ...input, email_domain: domain, status: 'pending' }).select('id').single();
  if (error?.code === '23505') return { join: true as const };
  if (error || !c) fail('Could not save the company. Please try again.');
  const { error: mErr } = await a.from('company_members').insert({ company_id: c!.id, user_id: userId, role: 'owner' });
  if (mErr) { await a.from('companies').delete().eq('id', c!.id); fail('Could not save the company. Please try again.'); }
  await a.from('company_join_requests').delete().eq('user_id', userId);
  await audit(a, c!.id, userId, 'employer', 'company_created');
  return { ok: true as const, companyId: c!.id as string };
}

export async function updateCompany(a: A, userId: string, input: CompanyInput) {
  const { company } = await requireMember(a, userId, { ownerOnly: true, full: false });
  if (!companyAccess(company.status).editProfile) fail('Your company profile can\u2019t be changed right now. Please contact support.');
  const { error } = await a.from('companies').update({ ...input, updated_at: new Date().toISOString() }).eq('id', company.id);
  if (error) fail('Could not save the company. Please try again.');
  await audit(a, company.id, userId, 'employer', 'profile_updated');
  return { ok: true as const };
}

export async function requestJoin(a: A, userId: string) {
  await requireEmployer(a, userId);
  if (await membershipOf(a, userId)) fail('You already belong to a company.');
  const user = await authUser(a, userId);
  const { data: c } = await a.from('companies').select('id,status').eq('email_domain', emailDomain(user.email ?? '')).maybeSingle();
  if (!c) fail('No company uses your email domain yet.');
  const { error } = await a.from('company_join_requests').upsert({ company_id: c!.id, user_id: userId }, { onConflict: 'user_id' });
  if (error) fail('Could not send the request. Please try again.');
  const ownerId = await ownerOf(a, c!.id);
  if (ownerId) await notifyUser(a, ownerId, 'Someone asked to join your company', `${user.email} asked to join. Review it on your Team page.`, `join-${userId}`).catch(() => undefined);
  return { ok: true as const };
}

export async function listTeam(a: A, userId: string) {
  const { member, company } = await requireMember(a, userId);
  const s = await accountSettings(a);
  const { data: rows, error } = await a.from('company_members').select('user_id,role,created_at').eq('company_id', company.id).order('created_at');
  if (error) fail('Could not load your team.');
  const ids = (rows ?? []).map((r) => r.user_id as string);
  const { data: profs } = ids.length ? await a.from('profiles').select('id,name,email').in('id', ids) : { data: [] };
  const pm = new Map((profs ?? []).map((p) => [p.id, p]));
  const members = (rows ?? []).map((r) => ({ userId: r.user_id as string, role: r.role as MemberRole, name: (pm.get(r.user_id)?.name as string) || '', email: (pm.get(r.user_id)?.email as string) || '', you: r.user_id === userId }));
  let invites: Array<{ id: string; email: string; role: string; expires_at: string }> = [];
  let requests: Array<{ id: string; email: string; name: string; created_at: string }> = [];
  if (member.role === 'owner') {
    const { data: inv } = await a.from('company_invites').select('id,email,role,expires_at').eq('company_id', company.id).is('accepted_at', null).gt('expires_at', new Date().toISOString());
    invites = (inv ?? []) as typeof invites;
    const { data: jr } = await a.from('company_join_requests').select('id,user_id,created_at').eq('company_id', company.id);
    const jIds = (jr ?? []).map((j) => j.user_id as string);
    const { data: jp } = jIds.length ? await a.from('profiles').select('id,name,email').in('id', jIds) : { data: [] };
    const jm = new Map((jp ?? []).map((p) => [p.id, p]));
    requests = (jr ?? []).map((j) => ({ id: j.id as string, email: (jm.get(j.user_id)?.email as string) || '', name: (jm.get(j.user_id)?.name as string) || '', created_at: j.created_at as string }));
  }
  const seats = await seatsUsed(a, company.id);
  return { role: member.role, domain: company.email_domain as string, maxSeats: s.employer_max_seats as number, used: seats.used, members, invites, requests };
}

export async function createInvite(a: A, userId: string, email: string, role: 'recruiter' | 'viewer', opts: Opts = {}) {
  const { company } = await requireMember(a, userId, { ownerOnly: true });
  const s = await accountSettings(a);
  const clean = email.trim().toLowerCase();
  const { data: prof } = await a.from('profiles').select('id').ilike('email', clean).maybeSingle();
  if (prof && (await membershipOf(a, prof.id))) fail('That person already belongs to a company.');
  await a.from('company_invites').delete().eq('company_id', company.id).eq('email', clean).is('accepted_at', null);
  const problem = inviteProblem(clean, company.email_domain, (await seatsUsed(a, company.id)).used, s.employer_max_seats);
  if (problem) fail(problem);
  const token = newToken();
  const expires = new Date(Date.now() + s.employer_invite_days * 86400000).toISOString();
  const { data: inv, error } = await a.from('company_invites').insert({ company_id: company.id, email: clean, role, token_hash: await hashToken(token), invited_by: userId, expires_at: expires }).select('id').single();
  if (error || !inv) fail('Could not create the invite. Please try again.');
  await audit(a, company.id, userId, 'employer', 'member_invited', `${clean} as ${role}`);
  if (opts.email !== false) {
    const { data: me } = await a.from('profiles').select('name').eq('id', userId).maybeSingle();
    await sendEmail('company-invite', clean, { company: company.name, inviter: me?.name || 'A colleague', url: absoluteUrl('/employers/invite', { token }), days: s.employer_invite_days }, `company-invite-${inv!.id}`);
  }
  return { ok: true as const, inviteId: inv!.id as string, token };
}

export async function revokeInvite(a: A, userId: string, inviteId: string) {
  const { company } = await requireMember(a, userId, { ownerOnly: true });
  const { data } = await a.from('company_invites').delete().eq('id', inviteId).eq('company_id', company.id).select('email');
  if (data?.length) await audit(a, company.id, userId, 'employer', 'invite_revoked', data[0].email as string);
  return { ok: true as const };
}

export async function removeMember(a: A, userId: string, target: string) {
  const { company } = await requireMember(a, userId, { ownerOnly: true });
  if (target === userId) fail('You can\u2019t remove yourself. Transfer ownership first.');
  const { data, error } = await a.from('company_members').delete().eq('company_id', company.id).eq('user_id', target).neq('role', 'owner').select('user_id');
  if (error || !data?.length) fail('That person is not on your team.');
  await audit(a, company.id, userId, 'employer', 'member_removed', target);
  return { ok: true as const };
}

export async function transferOwnership(a: A, userId: string, target: string) {
  const { company } = await requireMember(a, userId, { ownerOnly: true, full: false });
  if (target === userId) fail('You are already the owner.');
  const { data: t } = await a.from('company_members').select('user_id').eq('company_id', company.id).eq('user_id', target).maybeSingle();
  if (!t) fail('That person is not on your team.');
  // One owner at all times: step down first (unique owner index), then promote; undo on failure.
  const { error: e1 } = await a.from('company_members').update({ role: 'recruiter' }).eq('company_id', company.id).eq('user_id', userId);
  if (e1) fail('Could not transfer ownership.');
  const { error: e2 } = await a.from('company_members').update({ role: 'owner' }).eq('company_id', company.id).eq('user_id', target);
  if (e2) { await a.from('company_members').update({ role: 'owner' }).eq('company_id', company.id).eq('user_id', userId); fail('Could not transfer ownership.'); }
  await audit(a, company.id, userId, 'employer', 'ownership_transferred', target);
  return { ok: true as const };
}

export async function decideJoin(a: A, userId: string, requestId: string, approve: boolean, role: 'recruiter' | 'viewer' = 'viewer') {
  const { company } = await requireMember(a, userId, { ownerOnly: true });
  const { data: r } = await a.from('company_join_requests').select('id,user_id').eq('id', requestId).eq('company_id', company.id).maybeSingle();
  if (!r) fail('Request not found.');
  if (approve) {
    const s = await accountSettings(a);
    if ((await seatsUsed(a, company.id)).used >= s.employer_max_seats) fail(`Your company has reached its limit of ${s.employer_max_seats} seats.`);
    const { error } = await a.from('company_members').insert({ company_id: company.id, user_id: r!.user_id, role });
    if (error) fail('Could not add them. They may already belong to a company.');
  }
  await a.from('company_join_requests').delete().eq('id', requestId);
  await audit(a, company.id, userId, 'employer', approve ? 'join_approved' : 'join_declined', r!.user_id);
  await notifyUser(a, r!.user_id, approve ? `You joined ${company.name}` : 'Your request to join was declined', approve ? 'You now have access to your company\u2019s employer area.' : 'Contact the company owner if you think this is a mistake.', `join-decision-${requestId}`).catch(() => undefined);
  return { ok: true as const };
}

export async function inviteInfo(a: A, token: string) {
  const { data } = await a.from('company_invites').select('email,role,expires_at,accepted_at,companies(name)').eq('token_hash', await hashToken(token)).maybeSingle();
  if (!data || data.accepted_at) return null;
  return { email: data.email as string, role: data.role as string, expired: inviteExpired(data.expires_at as string), company: ((Array.isArray(data.companies) ? data.companies[0] : data.companies) as { name: string } | null)?.name ?? 'A company' };
}

export async function acceptInvite(a: A, userId: string, ref: { token?: string; inviteId?: string }, legal: { employerTerms: string; privacy: string }) {
  await requireEmployer(a, userId);
  const user = await authUser(a, userId);
  const q = a.from('company_invites').select('id,company_id,email,role,expires_at,accepted_at');
  const { data: inv } = ref.token ? await q.eq('token_hash', await hashToken(ref.token)).maybeSingle() : await q.eq('id', ref.inviteId ?? '').maybeSingle();
  if (!inv || inv.accepted_at) fail('This invite is not valid.');
  if (inviteExpired(inv!.expires_at as string)) fail('This invite has expired. Ask the company owner for a new one.');
  if ((user.email ?? '').toLowerCase() !== inv!.email) fail('This invite was sent to a different email address.');
  if (await membershipOf(a, userId)) fail('You already belong to a company.');
  const s = await accountSettings(a);
  if ((await seatsUsed(a, inv!.company_id)).members >= s.employer_max_seats) fail('This company has no free seats.');
  const { error: lErr } = await a.from('legal_acceptances').insert({ user_id: userId, terms_version: '', privacy_version: legal.privacy, employer_terms_version: legal.employerTerms, source: 'employer_invite' });
  if (lErr) fail('Could not record your acceptance.');
  const { error } = await a.from('company_members').insert({ company_id: inv!.company_id, user_id: userId, role: inv!.role });
  if (error) fail('Could not join the company.');
  await a.from('company_invites').update({ accepted_at: new Date().toISOString() }).eq('id', inv!.id);
  await a.from('company_join_requests').delete().eq('user_id', userId);
  await audit(a, inv!.company_id, userId, 'employer', 'member_joined', inv!.role as string);
  return { ok: true as const };
}

/** Listings sent through /employers from this company's domain (staff-reviewed). */
export async function mySubmissions(a: A, userId: string) {
  const { company } = await requireMember(a, userId);
  const pattern = '%@' + String(company.email_domain).replace(/[\\%_]/g, (m) => '\\' + m);
  const { data, error } = await a.from('job_center_private').select('job_id,reject_reason,job_center_jobs!inner(title,status,created_at,expires_date,deleted_at)').like('submitter_email', pattern);
  if (error) fail('Could not load your listings.');
  return (data ?? []).map((r) => {
    const j = (Array.isArray(r.job_center_jobs) ? r.job_center_jobs[0] : r.job_center_jobs) as { title: string; status: string; created_at: string; expires_date: string; deleted_at: string | null };
    return { id: r.job_id as string, title: j.title, status: j.deleted_at ? 'removed' : j.status, created_at: j.created_at, expires_date: j.expires_date, reject_reason: r.reject_reason as string | null };
  }).sort((x, y) => y.created_at.localeCompare(x.created_at));
}

// ---------- Staff side (db = the staff member's own client, so row-level security decides what is visible) ----------
export async function staffListCompanies(db: A, a: A) {
  const { data: companies, error } = await db.from('companies').select(COMPANY_COLS).order('created_at', { ascending: false }).limit(500);
  if (error) fail('Could not load companies.');
  const list = (companies ?? []) as Array<Record<string, any>>;
  const ids = list.map((c) => c.id);
  const [{ data: members }, { data: notes }, { data: subs }, { data: wait }] = await Promise.all([
    ids.length ? db.from('company_members').select('company_id,user_id,role').in('company_id', ids) : Promise.resolve({ data: [] as any[] }),
    ids.length ? db.from('company_staff_notes').select('company_id,notes').in('company_id', ids) : Promise.resolve({ data: [] as any[] }),
    db.from('job_center_private').select('submitter_email').neq('submitter_email', '').limit(5000),
    db.from('employer_waitlist').select('email').limit(5000),
  ]);
  const owners = new Map<string, string>();
  for (const m of members ?? []) if (m.role === 'owner') owners.set(m.company_id, m.user_id);
  const ownerInfo = new Map<string, { email: string; confirmed: boolean }>();
  for (const uid of owners.values()) {
    const u = await a.auth.admin.getUserById(uid).catch(() => null);
    if (u?.data.user) ownerInfo.set(uid, { email: u.data.user.email ?? '', confirmed: Boolean(u.data.user.email_confirmed_at) });
  }
  const sameBase = (d1: string, d2: string) => baseDomain(d1) === baseDomain(d2);
  return list.map((c) => {
    const o = owners.get(c.id); const oi = o ? ownerInfo.get(o) : undefined;
    return {
      ...c,
      ownerEmail: oi?.email ?? '', ownerConfirmed: oi?.confirmed ?? false,
      domainCheck: Boolean(oi?.confirmed) && websiteMatchesDomain(c.website, c.email_domain),
      memberCount: (members ?? []).filter((m) => m.company_id === c.id).length,
      notes: (notes ?? []).find((n) => n.company_id === c.id)?.notes ?? '',
      relatedCompanies: list.filter((x) => x.id !== c.id && sameBase(x.email_domain, c.email_domain)).map((x) => `${x.name} (${x.email_domain}, ${x.status})`),
      relatedSubmissions: (subs ?? []).filter((s) => sameBase(emailDomain(s.submitter_email), c.email_domain)).length,
      relatedWaitlist: (wait ?? []).filter((w) => sameBase(emailDomain(w.email), c.email_domain)).length,
    };
  });
}

export async function staffAction(a: A, staffId: string, companyId: string, action: StaffAction, reason: string, opts: Opts = {}) {
  const company = await loadCompany(a, companyId);
  const problem = transitionProblem(action, company.status, reason);
  if (problem) fail(problem);
  const to = TRANSITIONS[action].to;
  const { data: upd, error } = await a.from('companies').update({ status: to, status_reason: reason.trim(), reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', companyId).eq('status', company.status).select('id');
  if (error || !upd?.length) fail('The company changed while you were reviewing it. Reload and try again.');
  const auditId = await audit(a, companyId, staffId, 'staff', action, reason.trim());
  const ownerId = await ownerOf(a, companyId);
  let emailed = false, notified = false;
  if (ownerId) {
    const titles: Record<CompanyStatus, string> = { approved: `${company.name} has been reviewed by RoleProve`, rejected: `${company.name} was not approved`, suspended: `${company.name} has been suspended`, pending: '' };
    notified = (await notifyUser(a, ownerId, titles[to], reason.trim() ? `Reason: ${reason.trim()}` : 'Open your employer area for details.', `status-${auditId}`).catch(() => ({ created: false }))).created;
    if (opts.email !== false) {
      const owner = await authUser(a, ownerId).catch(() => null);
      if (owner?.email) { try { await sendEmail('company-status', owner.email, { company: company.name, status: to, reason: reason.trim(), url: absoluteUrl('/employer') }, `company-status-${auditId}`); emailed = true; } catch (e) { console.error('company status email', e); } }
    }
  }
  return { ok: true as const, status: to, emailed, notified };
}

export async function staffSaveNotes(a: A, staffId: string, companyId: string, notes: string) {
  const { error } = await a.from('company_staff_notes').upsert({ company_id: companyId, notes: notes.slice(0, 5000), updated_at: new Date().toISOString() });
  if (error) fail('Could not save notes.');
  await audit(a, companyId, staffId, 'staff', 'notes_updated');
  return { ok: true as const };
}

export async function staffAudit(db: A, a: A, companyId: string) {
  const { data, error } = await db.from('company_audit_log').select('id,actor_id,actor_kind,action,reason,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200);
  if (error) fail('Could not load the audit log.');
  const ids = [...new Set((data ?? []).map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: profs } = ids.length ? await a.from('profiles').select('id,email').in('id', ids) : { data: [] };
  const em = new Map((profs ?? []).map((p) => [p.id, p.email]));
  return (data ?? []).map((r) => ({ ...r, actor: r.actor_id ? (em.get(r.actor_id) ?? 'deleted account') : 'system' }));
}

// ---------- Cleanup and erasure ----------
const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

/** Hourly: rejected companies, companies past their deletion notice with no members, unconfirmed employer sign-ups, old invites. */
export async function cleanEmployerAccounts(a: A, eraseUser: (userId: string) => Promise<unknown>) {
  const s = await accountSettings(a);
  const out = { rejectedCompanies: 0, abandonedCompanies: 0, unconfirmedSignups: 0, invites: 0 };
  const r = await a.from('companies').delete().eq('status', 'rejected').lt('reviewed_at', ago(s.employer_rejected_days)).select('id');
  if (r.error) throw r.error; out.rejectedCompanies = r.data?.length ?? 0;
  const { data: due, error: dErr } = await a.from('companies').select('id').lt('delete_after', new Date().toISOString());
  if (dErr) throw dErr;
  for (const c of due ?? []) {
    const { count } = await a.from('company_members').select('user_id', { count: 'exact', head: true }).eq('company_id', c.id);
    if ((count ?? 0) > 0) { await a.from('companies').update({ delete_after: null }).eq('id', c.id); continue; }
    const d = await a.from('companies').delete().eq('id', c.id); if (d.error) throw d.error; out.abandonedCompanies++;
  }
  const i = await a.from('company_invites').delete().lt('expires_at', ago(1)).select('id');
  if (i.error) throw i.error; out.invites = i.data?.length ?? 0;
  const { data: emp, error: eErr } = await a.from('account_types').select('user_id').eq('kind', 'employer').lt('created_at', ago(s.employer_unconfirmed_days)).limit(200);
  if (eErr) throw eErr;
  for (const e of emp ?? []) {
    const { data } = await a.auth.admin.getUserById(e.user_id);
    if (data.user && !data.user.email_confirmed_at) { await eraseUser(e.user_id); out.unconfirmedSignups++; }
  }
  return out;
}

/** Runs before account erasure. Blocks an owner who still has team members; starts the notice period when the last member leaves. */
export async function prepareEmployerErasure(a: A, userId: string) {
  const m = await membershipOf(a, userId);
  if (m) {
    const { count } = await a.from('company_members').select('user_id', { count: 'exact', head: true }).eq('company_id', m.company_id);
    const problem = deletionProblem(m.role, count ?? 0);
    if (problem) throw new Error(problem);
    if ((count ?? 0) <= 1) {
      const s = await accountSettings(a);
      const { error } = await a.from('companies').update({ delete_after: new Date(Date.now() + s.company_delete_notice_days * 86400000).toISOString() }).eq('id', m.company_id);
      if (error) throw new Error(`Could not schedule company deletion: ${error.message}`);
      await audit(a, m.company_id, null, 'system', 'last_member_deleted', `Company scheduled for deletion in ${s.company_delete_notice_days} days`);
    } else {
      await audit(a, m.company_id, null, 'system', 'member_account_deleted');
    }
  }
  // The audit trail stays with the company, but no longer points at this person.
  const u1 = await a.from('company_audit_log').update({ actor_id: null }).eq('actor_id', userId);
  if (u1.error) throw new Error(`Could not anonymise the company audit log: ${u1.error.message}`);
  const u2 = await a.from('company_invites').update({ invited_by: null }).eq('invited_by', userId);
  if (u2.error) throw new Error(`Could not update invites: ${u2.error.message}`);
}
