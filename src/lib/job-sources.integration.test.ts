import { describe,it,expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
const ready=Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);
describe.skipIf(!ready)('job source database rules',()=>{
 it('enforces source identity, hashes all writes and keeps sources/contacts staff-only',async()=>{
  const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
  const ids:string[]=[];let uid='';let sourceId='';let email='';
  const base={title:'Source integration',company:'QA',arrangement:'remote',employment:'full-time',role_key:'data_analyst',seniority:'entry',summary:'QA',apply_url:'https://EXAMPLE.com:443/#one',status:'pending_review'};
  try{
   const ref=crypto.randomUUID();
   const first=await admin.from('job_center_jobs').insert({...base,source_ref:ref,external_id:'123'}).select('*').single();if(first.error)throw first.error;ids.push(first.data.id);
   expect(first.data.source_type).toBe('staff');expect(first.data.apply_url_hash).toMatch(/^[a-f0-9]{64}$/);
   const dup=await admin.from('job_center_jobs').insert({...base,source_ref:ref,external_id:'123'});expect(dup.error?.code).toBe('23505');
   const second=await admin.from('job_center_jobs').insert({...base,apply_url:'https://example.com#two',source_type:'company_board',source_ref:ref+'-other',external_id:'123'}).select('*').single();if(second.error)throw second.error;ids.push(second.data.id);expect(second.data.apply_url_hash).toBe(first.data.apply_url_hash);
   const changed=await admin.from('job_center_jobs').update({apply_url:'https://example.com/new'}).eq('id',second.data.id).select('apply_url_hash').single();expect(changed.data?.apply_url_hash).not.toBe(first.data.apply_url_hash);
   const priv=await admin.from('job_center_private').insert({job_id:first.data.id,submitter_name:'Private contact',submitter_email:'private@example.com'});if(priv.error)throw priv.error;
   const source=await admin.from('job_sources').insert({company_name:'QA',company_website:'https://example.com',board_type:'greenhouse',board_identifier:ref}).select('*').single();if(source.error)throw source.error;sourceId=source.data.id;expect(source.data.auto_publish).toBe(false);
   email=`source-test-${crypto.randomUUID()}@example.com`;const password=crypto.randomUUID();const user=await admin.auth.admin.createUser({email,password,email_confirm:true});if(user.error)throw user.error;uid=user.data.user.id;
   const url=process.env.SUPABASE_URL;const key=process.env.SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw new Error('Missing public client configuration');
   const member=createClient(url,key,{auth:{persistSession:false}});const login=await member.auth.signInWithPassword({email,password});if(login.error)throw login.error;
   expect((await member.from('job_sources').select('*')).data).toEqual([]);
   expect((await member.from('job_center_private').select('*').eq('job_id',first.data.id)).data).toEqual([]);
   expect((await member.from('job_center_jobs').select('*').in('id',ids)).data).toEqual([]);
   await admin.from('job_center_jobs').update({status:'rejected'}).eq('id',first.data.id);
   expect((await member.from('job_center_jobs').select('id').eq('id',first.data.id)).data).toEqual([]);
   await admin.from('profiles').update({is_support_staff:true}).eq('id',uid);
   expect((await member.from('job_sources').select('id').eq('id',sourceId)).data?.length).toBe(1);
   expect((await member.from('job_center_private').select('submitter_name').eq('job_id',first.data.id)).data?.[0]?.submitter_name).toBe('Private contact');
  }finally{
   if(ids.length)await admin.from('job_center_jobs').delete().in('id',ids);
   if(sourceId)await admin.from('job_sources').delete().eq('id',sourceId);
   if(uid){await admin.from('legal_acceptances').delete().eq('user_id',uid);await admin.auth.admin.deleteUser(uid);}
   if(email){const hash=await admin.rpc('billing_email_hash',{p_email:email});if(hash.data)await admin.from('billing_trial_history').delete().eq('email_hash',hash.data);}
  }
 },60000);
});