import { visitorHash } from './employer.server';
/** Only the keyed visitor hash is retained for rate limiting; counters never include identity or IP. */
export async function limitPublicJob(){
 const {supabaseAdmin:a}=await import('@/integrations/supabase/client.server');
 const h=await visitorHash(a);const r=await a.rpc('public_job_rate',{p_hash:h});
 if(r.error||r.data!==true)throw new Error('Too many requests. Please try again later.');return a;
}
