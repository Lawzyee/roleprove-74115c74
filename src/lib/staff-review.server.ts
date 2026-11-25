import type { SupabaseClient } from '@supabase/supabase-js';
/** Event-driven, globally batched email. Inbox notices are created by status-transition triggers through create_notification. */
export async function reviewEmail(a:SupabaseClient){
 const claim=await a.rpc('claim_staff_review_email');
 if(claim.error)throw new Error('Could not claim review notice.');
 if(claim.data!==true)return {sent:false};
 const {sendTemplateEmail}=await import('./email-templates/send-email');
 return sendTemplateEmail('staff-review','support@roleprove.com',{idempotencyKey:`staff-review-${Math.floor(Date.now()/3600000)}`,templateData:{}});
}
export async function reviewEmailSafe(a:SupabaseClient){try{await reviewEmail(a);}catch(e){console.error('staff review email failed',e);}}
