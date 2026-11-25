import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { requireCandidate } from './candidate-middleware';
import { settingsInputSchema } from './application-profile';
import { COVER_NOTE_MAX, EMPLOYER_STATUSES } from './applications';

const admin = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin;
const srv = () => import('./applications.server');
const id = z.object({ id: z.string().uuid() });
const wrap = async <T>(f: () => Promise<T>) => { try { return await f(); } catch (e) { return { error: (e as Error).message }; } };

// Candidates (employer accounts are refused by requireCandidate).
export const getApplyContextFn = createServerFn({ method: 'POST' }).middleware([requireCandidate]).inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).applyContext(await admin(), context.userId, data.jobId));
export const submitApplicationFn = createServerFn({ method: 'POST' }).middleware([requireCandidate])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), settings: settingsInputSchema, coverNote: z.string().max(COVER_NOTE_MAX), consent: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => wrap(async () => (await srv()).submitApplication(await admin(), context.userId, data)));
export const getMyApplicationsFn = createServerFn({ method: 'POST' }).middleware([requireCandidate])
  .handler(async ({ context }) => (await srv()).listMine(await admin(), context.userId));
export const withdrawApplicationFn = createServerFn({ method: 'POST' }).middleware([requireCandidate]).inputValidator((d: unknown) => id.parse(d))
  .handler(async ({ data, context }) => wrap(async () => (await srv()).withdrawApplication(await admin(), context.userId, data.id)));

// Employers: postingAccess (employer account, member of an approved company) is checked through the caller's own client first.
export const getApplicantsFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).listApplicants(context.supabase, await admin(), context.userId, data.jobId));
export const openApplicationFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => id.parse(d))
  .handler(async ({ data, context }) => wrap(async () => (await srv()).openApplication(context.supabase, await admin(), context.userId, data.id)));
export const applicationCvLinkFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => id.parse(d))
  .handler(async ({ data, context }) => wrap(async () => (await srv()).cvLink(context.supabase, await admin(), context.userId, data.id)));
export const setApplicationStatusFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(EMPLOYER_STATUSES) }).parse(d))
  .handler(async ({ data, context }) => wrap(async () => (await srv()).setApplicationStatus(context.supabase, await admin(), context.userId, data.id, data.status)));

// Staff: access log for misuse investigations (read through the caller's client; RLS allows staff only).
export const getApplicationAccessLogFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((d: unknown) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const st = await context.supabase.rpc('is_support_staff', { _user_id: context.userId }); if (st.error || st.data !== true) throw new Error('Staff only.');
    const r = await context.supabase.from('application_access_log').select('id,application_id,member_id,action,created_at').eq('company_id', data.companyId).order('created_at', { ascending: false }).limit(500);
    if (r.error) throw new Error('Could not load the access log.'); return r.data ?? [];
  });
