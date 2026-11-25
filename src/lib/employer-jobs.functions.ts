import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { postingSchema } from './employer-jobs';

export const getEmployerJobsFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const s = await import('./employer-jobs.server'); await s.postingAccess(context.supabase, context.userId);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); return s.listPostings(context.supabase, supabaseAdmin, context.userId);
});
export const saveEmployerJobFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((raw: unknown) => z.object({ id: z.string().uuid().optional(), input: postingSchema, submit: z.boolean() }).parse(raw)).handler(async ({ data, context }) => {
  const s = await import('./employer-jobs.server'); await s.postingAccess(context.supabase, context.userId, true);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); return s.savePosting(context.supabase, supabaseAdmin, context.userId, data.input, data.id, data.submit);
});
export const employerJobActionFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((raw: unknown) => z.object({ id: z.string().uuid(), action: z.enum(['pause', 'close', 'renew', 'duplicate', 'resume']), expiry: z.string().optional() }).parse(raw)).handler(async ({ data, context }) => {
  const s = await import('./employer-jobs.server'); await s.postingAccess(context.supabase, context.userId, true);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); return s.postingAction(context.supabase, supabaseAdmin, context.userId, data.id, data.action, data.expiry);
});
export const moderateEmployerJobFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((raw: unknown) => z.object({ id: z.string().uuid(), action: z.enum(['approve', 'reject', 'unpublish']), reason: z.string().trim().max(1000) }).parse(raw)).handler(async ({ data, context }) => {
  const st = await context.supabase.rpc('is_support_staff', { _user_id: context.userId }); if (st.error || st.data !== true) throw new Error('Staff only.');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const { moderatePosting } = await import('./employer-jobs.server'); return moderatePosting(supabaseAdmin, context.userId, data.id, data.action, data.reason);
});
export const setCompanyPostingReviewFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((raw: unknown) => z.object({ companyId: z.string().uuid(), every: z.boolean() }).parse(raw)).handler(async ({ data, context }) => {
  const st = await context.supabase.rpc('is_support_staff', { _user_id: context.userId }); if (st.error || st.data !== true) throw new Error('Staff only.');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const { setPostingReview } = await import('./employer-jobs.server'); return setPostingReview(supabaseAdmin, context.userId, data.companyId, data.every);
});
export const getStaffEmployerJobFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw)).handler(async ({ data, context }) => {
  const st = await context.supabase.rpc('is_support_staff', { _user_id: context.userId }); if (st.error || st.data !== true) throw new Error('Staff only.');
  const j = await context.supabase.from('employer_jobs').select('*').eq('id', data.id).single(); if (j.error || !j.data) throw new Error('Job not found.');
  const c = await context.supabase.from('companies').select('id,name,status,review_every_posting,review_reset_at').eq('id', j.data.company_id).single(); if (c.error || !c.data) throw new Error('Company not found.');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const { reviewLevel } = await import('./employer-jobs.server');
  const review = await reviewLevel(supabaseAdmin, c.data); return { job: j.data, company: c.data, review: { required: review.required, approvals: review.approvals, threshold: review.threshold } };
});
const limitsSchema = z.object({ employer_job_review_count: z.number().int().min(1).max(100), employer_active_jobs: z.number().int().min(1).max(1000), employer_daily_jobs: z.number().int().min(1).max(1000), employer_job_retention_months: z.number().int().min(1).max(120) });
export const getPostingLimitsFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const st = await context.supabase.rpc('is_support_staff', { _user_id: context.userId }); if (st.error || st.data !== true) throw new Error('Staff only.');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const { postingSettings } = await import('./employer-jobs.server'); return limitsSchema.parse(await postingSettings(supabaseAdmin));
});
export const savePostingLimitsFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((raw: unknown) => limitsSchema.parse(raw)).handler(async ({ data, context }) => {
  const st = await context.supabase.rpc('is_support_staff', { _user_id: context.userId }); if (st.error || st.data !== true) throw new Error('Staff only.');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server'); const r = await supabaseAdmin.from('app_settings').update(data).eq('id', true); if (r.error) throw new Error('Could not save posting limits.'); return { ok: true };
});