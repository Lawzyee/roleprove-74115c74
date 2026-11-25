import { z } from 'zod';
import { absoluteUrl } from './site-url';
/** A second, deliberately smaller boundary than the signed-in candidate allow-list. Unknown keys are stripped. */
export const PUBLIC_SHARE_FIELDS = ['id','title','company','city','country','arrangement','employment','salary_currency','salary_min','salary_max','salary_period','summary','full_description','apply_url','posted_date','expires_date','application_method','company_approved'] as const;
export const publicSharedJobSchema = z.object({
 id:z.string().uuid(),title:z.string(),company:z.string(),city:z.string(),country:z.string(),arrangement:z.string(),employment:z.string(),salary_currency:z.string().nullable(),salary_min:z.number().nullable(),salary_max:z.number().nullable(),salary_period:z.string().nullable(),summary:z.string(),full_description:z.string().nullable(),apply_url:z.string(),posted_date:z.string(),expires_date:z.string(),application_method:z.string().nullable(),company_approved:z.boolean(),
});
export type SharedJob = z.infer<typeof publicSharedJobSchema>;
export type PublicJobResult = {state:'not_found'|'unavailable'} | {state:'published';indexable:boolean;job:SharedJob};
export function parsePublicJob(raw: unknown): PublicJobResult {
 const base=z.object({state:z.enum(['not_found','unavailable','published'])}).parse(raw);
 if(base.state!=='published')return {state:base.state};
 const data=z.object({indexable:z.boolean(),job:publicSharedJobSchema}).parse(raw);
 return {state:'published',...data};
}
export const sharedJobPath=(id:string)=>`/j/${z.string().uuid().parse(id)}`;
export const sharedJobUrl=(id:string)=>absoluteUrl(sharedJobPath(id));
/** Return targets must be internal paths, including after decoding. Reject encoded slashes, control characters and URL credentials. */
export function safeReturnTo(value:unknown):string|undefined {
 if(typeof value!=='string'||value.length>2000||!value.startsWith('/')||value.startsWith('//'))return;
 try {
 const decoded=decodeURIComponent(value);
 if(!decoded.startsWith('/')||decoded.startsWith('//')||/[\\\s\u0000-\u001f\u007f]/.test(decoded)||/%(?:2f|5c|25)/i.test(decoded))return;
 const u=new URL(value,'https://internal.invalid');
 if(u.origin!=='https://internal.invalid')return;
 return u.pathname+u.search+u.hash;
 }catch{return;}
}
