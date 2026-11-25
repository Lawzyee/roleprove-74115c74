import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { absoluteUrl } from './site-url';
import { CURRENT_EMPLOYER_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from './legal';
import { ACCOUNT_EXISTS_MESSAGE, INVITE_ROLES, STAFF_ACTIONS, WORK_EMAIL_MESSAGE, companySchema, employerSignUpSchema, workEmailProblem } from './employer-accounts';

const admin = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin;
const srv = () => import('./employer-accounts.server');
const LIMITED = 'Too many requests from your connection. Please try again in an hour.';
const SENT = { ok: true as const };
const wrap = async <T,>(fn: () => Promise<T>) => { try { return await fn(); } catch (e) { return { error: (e as Error).message || 'Something went wrong. Please try again.' }; } };

/** Employer sign-up. Server-side so the work-email rule, rate limit, honeypot and generic duplicate answer can't be skipped. */
export const employerSignUpFn = createServerFn({ method: 'POST' }).inputValidator((d: unknown) => employerSignUpSchema.parse(d)).handler(async ({ data }) => {
  if (data.website) return SENT; // honeypot
  const a = await admin();
  const { rateHit } = await import('./employer.server');
  if (!(await rateHit(a, 'employer_signup'))) return { error: LIMITED };
  const s = await (await srv()).accountSettings(a);
  const problem = workEmailProblem(data.email, s.personal_email_domains, s.disposable_email_domains);
  if (problem) return { error: problem };
  const { data: existing } = await a.from('profiles').select('id').ilike('email', data.email).limit(1);
  if (existing?.length) return { error: ACCOUNT_EXISTS_MESSAGE };
  const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
  const pub = createClient(process.env['SUPABASE_URL']!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { fetch: (input, init) => { const h = new Headers(init?.headers); if (key.startsWith('sb_') && h.get('Authorization') === `Bearer ${key}`) h.delete('Authorization'); h.set('apikey', key); return fetch(input, { ...init, headers: h }); } },
  });
  const { data: res, error } = await pub.auth.signUp({ email: data.email, password: data.password, options: {
    emailRedirectTo: absoluteUrl('/auth/confirm'),
    data: { name: data.name, account_type: 'employer', employer_terms_version: CURRENT_EMPLOYER_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION },
  } });
  if (error) {
    if (/database error|work email/i.test(error.message)) return { error: WORK_EMAIL_MESSAGE };
    if (/already|exists/i.test(error.message)) return { error: ACCOUNT_EXISTS_MESSAGE };
    if (error.status === 429) return { error: 'Too many requests. Please wait a minute before trying again.' };
    if (/password/i.test(error.message)) return { error: 'Please choose a stronger password.' };
    return { error: 'We couldn\u2019t create your account. Please try again in a moment.' };
  }
  if (res.user?.identities?.length === 0) return { error: ACCOUNT_EXISTS_MESSAGE };
  return SENT;
});

export const getInviteFn = createServerFn({ method: 'POST' }).inputValidator((d: unknown) => z.object({ token: z.string().min(20).max(200) }).parse(d)).handler(async ({ data }) => {
  return { invite: await (await srv()).inviteInfo(await admin(), data.token) };
});


export const getEmployerStateFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await srv()).getEmployerState(await admin(), context.userId));
export const createCompanyFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => companySchema.parse(d)).handler(async ({ data, context }) => wrap(async () => (await srv()).createCompany(await admin(), context.userId, data)));
export const updateCompanyFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => companySchema.parse(d)).handler(async ({ data, context }) => wrap(async () => (await srv()).updateCompany(await admin(), context.userId, data)));
export const requestJoinFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => wrap(async () => (await srv()).requestJoin(await admin(), context.userId)));
export const listTeamFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => (await srv()).listTeam(await admin(), context.userId));
export const createInviteFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254), role: z.enum(INVITE_ROLES) }).parse(d))
  .handler(async ({ data, context }) => wrap(async () => { await (await srv()).createInvite(await admin(), context.userId, data.email, data.role); return SENT; }));
const idInput = z.object({ id: z.string().uuid() });
export const revokeInviteFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => idInput.parse(d)).handler(async ({ data, context }) => wrap(async () => (await srv()).revokeInvite(await admin(), context.userId, data.id)));
export const removeMemberFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => idInput.parse(d)).handler(async ({ data, context }) => wrap(async () => (await srv()).removeMember(await admin(), context.userId, data.id)));
export const transferOwnershipFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => idInput.parse(d)).handler(async ({ data, context }) => wrap(async () => (await srv()).transferOwnership(await admin(), context.userId, data.id)));
export const decideJoinFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ id: z.string().uuid(), approve: z.boolean(), role: z.enum(INVITE_ROLES) }).parse(d))
  .handler(async ({ data, context }) => wrap(async () => (await srv()).decideJoin(await admin(), context.userId, data.id, data.approve, data.role)));
export const acceptInviteFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ token: z.string().min(20).max(200).optional(), inviteId: z.string().uuid().optional(), terms: z.literal(true, { errorMap: () => ({ message: 'Please accept the Employer Terms and Privacy Policy.' }) }) }).parse(d))
  .handler(async ({ data, context }) => wrap(async () => (await srv()).acceptInvite(await admin(), context.userId, { token: data.token, inviteId: data.inviteId }, { employerTerms: CURRENT_EMPLOYER_TERMS_VERSION, privacy: CURRENT_PRIVACY_VERSION })));
export const mySubmissionsFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => ({ rows: await (await srv()).mySubmissions(await admin(), context.userId) }));

// ---------- Staff only ----------
async function requireStaff(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc('is_support_staff', { _user_id: context.userId });
  if (error || data !== true) throw new Error('Staff only.');
}
export const staffCompaniesFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => { await requireStaff(context); return { rows: await (await srv()).staffListCompanies(context.supabase, await admin()) }; });
export const staffCompanyAuditFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => idInput.parse(d)).handler(async ({ data, context }) => { await requireStaff(context); return { rows: await (await srv()).staffAudit(context.supabase, await admin(), data.id) }; });
export const staffCompanyActionFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ id: z.string().uuid(), action: z.enum(STAFF_ACTIONS), reason: z.string().trim().max(1000) }).parse(d))
  .handler(async ({ data, context }) => { await requireStaff(context); return wrap(async () => (await srv()).staffAction(await admin(), context.userId, data.id, data.action, data.reason)); });
export const staffCompanyNotesFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ id: z.string().uuid(), notes: z.string().max(5000) }).parse(d))
  .handler(async ({ data, context }) => { await requireStaff(context); return wrap(async () => (await srv()).staffSaveNotes(await admin(), context.userId, data.id, data.notes)); });
const domainList = z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Enter domains like example.com')).max(2000);
export const getEmailDomainListsFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => { await requireStaff(context); const s = await (await srv()).accountSettings(await admin()); return { personal: s.personal_email_domains as string[], disposable: s.disposable_email_domains as string[] }; });
export const saveEmailDomainListsFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ personal: domainList, disposable: domainList }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { error } = await (await admin()).from('app_settings').update({ personal_email_domains: [...new Set(data.personal)], disposable_email_domains: [...new Set(data.disposable)] }).eq('id', true);
    if (error) throw new Error('Could not save the lists.');
    return SENT;
  });
