import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { jobSchema, ARRANGEMENTS, EMPLOYMENT, TRACKER_STATUSES, JOB_REPORT_REASONS } from './job-center';

const idSchema=z.object({id:z.string().uuid()});
const preferencesSchema=z.object({roles:z.array(z.enum(['data_analyst','customer_support','other'])).max(3),arrangements:z.array(z.enum(ARRANGEMENTS)).max(3),employment_types:z.array(z.enum(EMPLOYMENT)).max(5),countries:z.array(z.string().trim().min(1).max(100)).max(30)});
export const getJobCenterFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const [jobs,tracker,prefs,profile]=await Promise.all([
    context.supabase.from('job_center_jobs').select('*').order('posted_date',{ascending:false}),
    context.supabase.from('job_tracker').select('*,job_center_jobs(*)').eq('user_id',context.userId),
    context.supabase.from('job_preferences').select('*').eq('user_id',context.userId).maybeSingle(),
    context.supabase.from('profiles').select('target_role_id').eq('id',context.userId).maybeSingle(),
  ]);
  for(const r of [jobs,tracker,prefs,profile])if(r.error)throw new Error('Could not load the Job center.');
  return {jobs:jobs.data??[],tracker:tracker.data??[],preferences:prefs.data,targetRoleId:profile.data?.target_role_id??null};
});
export const saveJobPreferencesFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>preferencesSchema.parse(d)).handler(async({data,context})=>{
  const {error}=await context.supabase.from('job_preferences').upsert({...data,user_id:context.userId,updated_at:new Date().toISOString()});if(error)throw new Error('Could not save preferences.');return {ok:true};
});
export const saveTrackedJobFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({id:z.string().uuid(),status:z.enum(TRACKER_STATUSES),notes:z.string().trim().max(4000)}).parse(d)).handler(async({data,context})=>{
  const {data:job,error:readError}=await context.supabase.from('job_center_jobs').select('id').eq('id',data.id).maybeSingle();if(readError||!job)throw new Error('Job not available.');
  const {error}=await context.supabase.from('job_tracker').upsert({job_id:data.id,user_id:context.userId,status:data.status,notes:data.notes,updated_at:new Date().toISOString()},{onConflict:'user_id,job_id'});if(error)throw new Error('Could not save this job.');return {ok:true};
});
export const removeTrackedJobFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>idSchema.parse(d)).handler(async({data,context})=>{const {error}=await context.supabase.from('job_tracker').delete().eq('user_id',context.userId).eq('job_id',data.id);if(error)throw error;return {ok:true};});
export const clickApplyJobFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>idSchema.parse(d)).handler(async({data,context})=>{const {error}=await context.supabase.rpc('increment_job_apply',{p_job:data.id});if(error)throw new Error('Job unavailable.');return {ok:true};});
export const reportJobFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({id:z.string().uuid(),reason:z.enum(JOB_REPORT_REASONS),details:z.string().trim().max(2000)}).parse(d)).handler(async({data,context})=>{
  const {data:ticket,error}=await context.supabase.rpc('report_job_center',{p_job:data.id,p_reason:data.reason,p_details:data.details});if(error)throw new Error(error.message.includes('5 job reports')?'You can report up to 5 jobs per hour.':'Could not report this job.');return {ticketId:ticket};
});
export const getStaffJobsFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data:staff,error}=await context.supabase.rpc('is_support_staff',{_user_id:context.userId});if(error||staff!==true)throw new Error('Staff only.');
  const {data:jobs,error:e}=await context.supabase.from('job_center_jobs').select('*,job_center_private(*)').is('deleted_at',null).order('created_at',{ascending:false});if(e)throw e;return {jobs:jobs??[]};
});
export const saveStaffJobFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>jobSchema.parse(d)).handler(async({data,context})=>{
  const {data:staff,error}=await context.supabase.rpc('is_support_staff',{_user_id:context.userId});if(error||staff!==true)throw new Error('Staff only.');
  const {resolvePublicLink}=await import('./job-links.server');await resolvePublicLink(data.apply_url);if(data.company_website)await resolvePublicLink(data.company_website);
  const {id,practice_text,source_note,staff_notes,...publicJob}=data;
  const payload={...publicJob,company_website:publicJob.company_website||null,updated_at:new Date().toISOString()};
  const result=id?await context.supabase.from('job_center_jobs').update(payload).eq('id',id).select('id').single():await context.supabase.from('job_center_jobs').insert(payload).select('id').single();
  if(result.error||!result.data)throw new Error('Could not save the job.');
  const {error:e}=await context.supabase.from('job_center_private').upsert({job_id:result.data.id,practice_text,source_note,staff_notes,consecutive_failures:0,link_broken:false,last_checked_at:null});if(e)throw new Error('Could not save private job details.');return {id:result.data.id};
});
export const deleteStaffJobFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>idSchema.parse(d)).handler(async({data,context})=>{
  const {data:staff,error}=await context.supabase.rpc('is_support_staff',{_user_id:context.userId});if(error||staff!==true)throw new Error('Staff only.');
  const {error:e}=await context.supabase.from('job_center_jobs').update({status:'hidden',deleted_at:new Date().toISOString()}).eq('id',data.id);if(e)throw e;
  const {error:p}=await context.supabase.from('job_center_private').delete().eq('job_id',data.id);if(p)throw p;return {ok:true};
});
export const checkStaffJobFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>idSchema.parse(d)).handler(async({data,context})=>{
  const {data:staff,error}=await context.supabase.rpc('is_support_staff',{_user_id:context.userId});if(error||staff!==true)throw new Error('Staff only.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const {checkOneJob}=await import('./job-center.server');return checkOneJob(supabaseAdmin,data.id,true);
});
export const practiceJobFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({id:z.string().uuid(),kind:z.enum(['simulation','interview_prep']),environment:z.enum(['sandbox','live'])}).parse(d)).handler(async({data,context})=>{
  const {data:job,error}=await context.supabase.from('job_center_jobs').select('id,role_key,other_role,title,status,expires_date,deleted_at').eq('id',data.id).maybeSingle();
  if(error||!job||job.status!=='published'||job.deleted_at||job.expires_date<new Date().toISOString().slice(0,10))throw new Error('Job unavailable.');
  if(data.kind==='simulation'&&job.role_key==='other')throw new Error('A simulation for that role is not available yet.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {data:privateJob,error:p}=await supabaseAdmin.from('job_center_private').select('practice_text').eq('job_id',job.id).single();if(p||!privateJob)throw new Error('Practice text unavailable.');
  const {withUsage}=await import('./billing.server');
  const {ROLE_REGISTRY}=await import('./role-registry');
  const roleKey=job.role_key==='data_analyst'||job.role_key==='customer_support'?job.role_key:undefined;
  const roleName=roleKey?ROLE_REGISTRY[roleKey].name:job.other_role;
  return withUsage(context.userId,data.environment,data.kind,async()=>{
    if(data.kind==='simulation') {
      const {generatePersonalisedSimulation}=await import('./jd.server');
      const r=await generatePersonalisedSimulation(context.userId,{text:privateJob.practice_text,roleKey,privateSource:true});
      if(r.outcome!=='matched')throw new Error('Could not generate this practice simulation.');
      const {data:attempt,error:a}=await supabaseAdmin.from('simulation_attempts').update({job_center_id:job.id}).eq('id',r.attemptId).eq('user_id',context.userId).select('job_posting_id').single();if(a)throw a;
      if(attempt.job_posting_id){const {error:redact}=await supabaseAdmin.from('job_postings').update({raw_text:'Practice based on a staff-curated external listing.'}).eq('id',attempt.job_posting_id).eq('user_id',context.userId);if(redact)throw redact;}
      return {kind:'simulation' as const,resourceId:r.attemptId};
    }
    const {createPrepSession}=await import('./interview-prep.server');
    const r=await createPrepSession(context.userId,{text:privateJob.practice_text,roleName,privateSource:true});if(r.outcome!=='ready')throw new Error('Could not generate interview prep.');
    const {error:redact}=await supabaseAdmin.from('interview_prep_sessions').update({source_jd_text:'Practice based on a staff-curated external listing.'}).eq('id',r.sessionId).eq('user_id',context.userId);if(redact)throw redact;
    return {kind:'interview_prep' as const,resourceId:r.sessionId};
  },r=>r.resourceId);
});