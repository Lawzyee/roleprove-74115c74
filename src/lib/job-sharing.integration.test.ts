import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
const ready=Boolean(process.env['SUPABASE_URL']&&process.env['SUPABASE_SERVICE_ROLE_KEY']&&process.env['SUPABASE_PUBLISHABLE_KEY']);
describe.skipIf(!ready)('public job pages (live database)',()=>{
 it('returns only allowed fields, hides unpublished jobs as unknown and gives closed jobs a calm state',async()=>{
  const {supabaseAdmin:a}=await import('@/integrations/supabase/client.server');const anon=createClient(process.env['SUPABASE_URL']!,process.env['SUPABASE_PUBLISHABLE_KEY']!,{auth:{persistSession:false}});
  const base={title:'Public QA',company:'QA',arrangement:'remote',employment:'full-time',role_key:'data_analyst',seniority:'entry',summary:'QA summary',apply_url:'https://example.com/apply',posted_date:new Date().toISOString().slice(0,10),expires_date:new Date(Date.now()+86400000).toISOString().slice(0,10),source_type:'staff'};
  const ids:string[]=[];try{
   const pub=await a.from('job_center_jobs').insert({...base,status:'published'}).select('id').single();if(pub.error)throw pub.error;ids.push(pub.data.id);
   await a.from('job_center_private').upsert({job_id:pub.data.id,practice_text:'PRIVATE PRACTICE SENTINEL',staff_notes:'STAFF SENTINEL',source_note:'SOURCE SENTINEL'});
   const draft=await a.from('job_center_jobs').insert({...base,status:'draft'}).select('id').single();if(draft.error)throw draft.error;ids.push(draft.data.id);
   const r=await anon.rpc('read_public_job',{p_job:pub.data.id});expect(r.error).toBeNull();expect(JSON.stringify(r.data)).not.toMatch(/SENTINEL|practice|staff_notes|source_note|views|apply_clicks/);expect((r.data as any).indexable).toBe(false);
   expect((await anon.rpc('read_public_job',{p_job:draft.data.id})).data).toEqual({state:'not_found'});expect((await anon.rpc('read_public_job',{p_job:crypto.randomUUID()})).data).toEqual({state:'not_found'});
   expect((await anon.rpc('count_public_job',{p_job:pub.data.id,p_apply:true})).error).toBeTruthy();
   expect((await a.rpc('count_public_job',{p_job:pub.data.id,p_apply:true})).data).toBe(true);expect((await a.rpc('count_public_job',{p_job:pub.data.id,p_apply:false})).data).toBe(true);const c=await a.from('job_center_private').select('*').eq('job_id',pub.data.id).single();expect(c.data?.apply_clicks).toBe(1);expect(c.data?.page_views).toBe(1);expect(Object.keys(c.data??{}).join()).not.toMatch(/visitor|ip|viewer/);
   await a.from('job_center_jobs').update({status:'hidden'}).eq('id',pub.data.id);expect((await anon.rpc('read_public_job',{p_job:pub.data.id})).data).toEqual({state:'unavailable'});
   await a.from('job_center_jobs').update({public_page_enabled:false}).eq('id',pub.data.id);expect((await anon.rpc('read_public_job',{p_job:pub.data.id})).data).toEqual({state:'not_found'});
  }finally{if(ids.length){await a.from('job_center_private').delete().in('job_id',ids);await a.from('job_center_jobs').delete().in('id',ids);}}
 },60000);
});
