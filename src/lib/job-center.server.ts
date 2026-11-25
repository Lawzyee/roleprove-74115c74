import type { SupabaseClient } from '@supabase/supabase-js';
import { checkApplicationLink, LinkCheckUnavailable } from './job-links.server';
import { failureState } from './job-center';

export async function checkOneJob(admin:SupabaseClient,id:string,force=false) {
  const {data:job,error}=await admin.from('job_center_jobs').select('id,apply_url,status,deleted_at').eq('id',id).single();
  if(error||!job||job.deleted_at)throw new Error('Job not found.');
  const since=new Date(Date.now()-86400000).toISOString();
  let claim=admin.from('job_center_private').update({check_started_at:new Date().toISOString()}).eq('job_id',id).or(`check_started_at.is.null,check_started_at.lt.${new Date(Date.now()-60000).toISOString()}`);
  if(!force)claim=claim.or(`last_checked_at.is.null,last_checked_at.lt.${since}`);
  const {data:rows,error:claimError}=await claim.select('consecutive_failures');
  if(claimError)throw claimError;
  if(!rows?.length)return {skipped:true,success:false,hidden:false};
  let success=false;
  try{success=await checkApplicationLink(job.apply_url);}catch(e){
    if(e instanceof LinkCheckUnavailable){await admin.from('job_center_private').update({check_started_at:null}).eq('job_id',id);throw e;}
    success=false;
  }
  const result=failureState(rows[0].consecutive_failures,success);
  const {error:saveError}=await admin.from('job_center_private').update({last_checked_at:new Date().toISOString(),check_started_at:null,consecutive_failures:result.failures,link_broken:result.hide}).eq('job_id',id);
  if(saveError)throw saveError;
  if(result.hide){const {error:e}=await admin.from('job_center_jobs').update({status:'hidden',updated_at:new Date().toISOString()}).eq('id',id).eq('apply_url',job.apply_url);if(e)throw e;const paused=await admin.from('employer_jobs').update({status:'paused',moderation_reason:'Apply link failed three checks. Verify it before resuming.'}).eq('id',id).eq('status','published');if(paused.error)throw paused.error;}
  return {skipped:false,success,hidden:result.hide};
}
export async function cleanJobCenter(admin:SupabaseClient) {
  const today=new Date().toISOString().slice(0,10);
  const {error}=await admin.from('job_center_jobs').update({status:'expired',updated_at:new Date().toISOString()}).eq('status','published').lt('expires_date',today);
  if(error)throw error;
  const jobs:{id:string}[]=[];
  for(let offset=0;;offset+=1000){
    const {data:page,error:e}=await admin.from('job_center_jobs').select('id,job_center_private!inner(last_checked_at)').eq('status','published').is('deleted_at',null).or(`last_checked_at.is.null,last_checked_at.lt.${new Date(Date.now()-86400000).toISOString()}`,{referencedTable:'job_center_private'}).order('id').range(offset,offset+999);
    if(e)throw e;jobs.push(...(page??[]));if(!page||page.length<1000)break;
  }
  const results=[];
  for(let offset=0;offset<jobs.length;offset+=10)results.push(...await Promise.all(jobs.slice(offset,offset+10).map(async j=>{try{return await checkOneJob(admin,j.id);}catch(e){if(e instanceof LinkCheckUnavailable)return {skipped:true,success:false,hidden:false};throw e;}})));
  return {checked:results.filter(r=>!r.skipped).length,hidden:results.filter(r=>r.hidden).length};
}