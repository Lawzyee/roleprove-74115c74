import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { parsePublicJob } from './job-sharing';
const idInput=z.object({id:z.string().uuid()});
export const readPublicJobFn=createServerFn({method:'GET'}).inputValidator((d:unknown)=>idInput.parse(d)).handler(async({data})=>{
 const {limitPublicJob}=await import('./job-sharing.server');await limitPublicJob();
 const key=process.env['SUPABASE_PUBLISHABLE_KEY'];const url=process.env['SUPABASE_URL'];if(!key||!url)throw new Error('Job pages unavailable.');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>{const h=new Headers(init?.headers);if(key.startsWith('sb_')&&h.get('Authorization')===`Bearer ${key}`)h.delete('Authorization');h.set('apikey',key);return fetch(input,{...init,headers:h});}}});
 const r=await db.rpc('read_public_job',{p_job:data.id});if(r.error)throw new Error('Could not load this job.');return parsePublicJob(r.data);
});
export const countPublicJobFn=createServerFn({method:'POST'}).inputValidator((d:unknown)=>idInput.extend({apply:z.boolean().default(false)}).parse(d)).handler(async({data})=>{
 const {limitPublicJob}=await import('./job-sharing.server');const a=await limitPublicJob();
 const r=await a.rpc('count_public_job',{p_job:data.id,p_apply:data.apply});if(r.error)throw new Error('Could not record this visit.');return {ok:r.data===true};
});
async function staff(context:{supabase:any;userId:string}){const r=await context.supabase.rpc('is_support_staff',{_user_id:context.userId});if(r.error||r.data!==true)throw new Error('Staff only.');}
export const staffReviewStateFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 await staff(context);const {supabaseAdmin:a}=await import('@/integrations/supabase/client.server');
 const [jobs,companies,settings]=await Promise.all([a.from('job_center_jobs').select('id',{head:true,count:'exact'}).eq('status','pending_review').is('deleted_at',null),a.from('companies').select('id',{head:true,count:'exact'}).eq('status','pending').is('delete_after',null),a.from('app_settings').select('public_jobs_enabled,public_jobs_indexable').eq('id',true).single()]);
 if(jobs.error||companies.error||settings.error||!settings.data)throw new Error('Could not load review counts.');
 return {jobs:jobs.count??0,companies:companies.count??0,...settings.data};
});
export const setPublicJobsFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>z.object({enabled:z.boolean(),indexable:z.boolean()}).parse(d)).handler(async({data,context})=>{
 await staff(context);const {supabaseAdmin:a}=await import('@/integrations/supabase/client.server');const r=await a.from('app_settings').update({public_jobs_enabled:data.enabled,public_jobs_indexable:data.indexable}).eq('id',true);if(r.error)throw new Error('Could not save settings.');return {ok:true};
});
export const setJobPublicPageFn=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((d:unknown)=>idInput.extend({enabled:z.boolean()}).parse(d)).handler(async({data,context})=>{
 await staff(context);const {supabaseAdmin:a}=await import('@/integrations/supabase/client.server');const r=await a.from('job_center_jobs').update({public_page_enabled:data.enabled}).eq('id',data.id).select('id').single();if(r.error)throw new Error('Could not save this public page setting.');return {ok:true};
});
