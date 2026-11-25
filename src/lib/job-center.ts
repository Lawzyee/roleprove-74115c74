import { z } from 'zod';
import ipaddr from 'ipaddr.js';
export const ARRANGEMENTS = ['remote','hybrid','on-site'] as const;
export const EMPLOYMENT = ['full-time','part-time','contract','internship','freelance'] as const;
export const TRACKER_STATUSES = ['saved','applied','interviewing','offer','rejected','not_interested'] as const;
export const JOB_REPORT_REASONS = ['looks like a scam','link broken or job closed','wrong information','other'] as const;
export const PAGE_SIZE = 20;
export const JOB_STATUSES = ['draft','pending_review','published','rejected','expired','hidden'] as const;
export const SOURCE_TYPES = ['staff','company_board','employer_submitted','employer_account'] as const;
export function publicAddress(value: string): boolean {
  try { const addr = ipaddr.process(value.replace(/^\[|\]$/g,'')); return addr.range() === 'unicast'; } catch { return false; }
}
export function applyLinkProblem(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return 'Use a public HTTPS link without login details or a custom port.';
    const host = u.hostname.toLowerCase().replace(/\.$/,'');
    if (!host.includes('.') || /(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$/.test(host)) return 'Private or internal addresses are not allowed.';
    if (ipaddr.isValid(host.replace(/^\[|\]$/g,'')) && !publicAddress(host)) return 'Private or internal addresses are not allowed.';
    return null;
  } catch { return 'Enter a valid HTTPS application link.'; }
}
export function shortenerWarning(value: string) { try { return ['bit.ly','tinyurl.com','t.co','shorturl.at','is.gd','rb.gy','ow.ly'].includes(new URL(value).hostname); } catch { return false; } }
const text = (max: number) => z.string().trim().max(max);
export const jobSchema = z.object({
  id: z.string().uuid().optional(), title:text(180).min(1), company:text(180).min(1), company_website:text(2000).nullable().optional(),
  city:text(100), country:text(100), arrangement:z.enum(ARRANGEMENTS), employment:z.enum(EMPLOYMENT), role_key:z.enum(['data_analyst','customer_support','other']), other_role:text(100), seniority:z.enum(['entry','mid','senior']),
  salary_currency:text(3).nullable(), salary_min:z.number().nonnegative().nullable(), salary_max:z.number().nonnegative().nullable(), salary_period:z.enum(['hour','month','year']).nullable(), summary:text(600).min(1), apply_url:text(2000).refine(v=>!applyLinkProblem(v), 'Use a public HTTPS application link.'),
  posted_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/), expires_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status:z.enum(JOB_STATUSES), practice_text:text(20000), source_note:text(1000), staff_notes:text(4000),
  source_type:z.enum(SOURCE_TYPES).default('staff'),source_ref:text(500).nullable().default(null),external_id:text(500).nullable().default(null),
  submitter_name:text(180).default(''),submitter_email:z.union([z.literal(''),z.string().trim().email().max(254)]).default(''),
}).superRefine((v,c)=>{
  if(v.role_key==='other'&&!v.other_role) c.addIssue({code:'custom',path:['other_role'],message:'Name the role.'});
  if(v.salary_min!==null&&v.salary_max!==null&&v.salary_max<v.salary_min) c.addIssue({code:'custom',path:['salary_max'],message:'Maximum must be at least the minimum.'});
  if((v.salary_min!==null||v.salary_max!==null)&&(!v.salary_currency||!v.salary_period)) c.addIssue({code:'custom',path:['salary_currency'],message:'Choose currency and salary period.'});
  if(v.expires_date<v.posted_date) c.addIssue({code:'custom',path:['expires_date'],message:'Expiry must be on or after posting.'});
  if(v.status==='published'&&!v.practice_text&&!['employer_submitted','employer_account'].includes(v.source_type)) c.addIssue({code:'custom',path:['practice_text'],message:'Add practice text before publishing.'});
  if(v.company_website&&applyLinkProblem(v.company_website)) c.addIssue({code:'custom',path:['company_website'],message:'Use a public HTTPS website.'});
});
export type JobInput = z.infer<typeof jobSchema>;
export type Job = { id:string;title:string;company:string;company_website:string|null;city:string;country:string;arrangement:string;employment:string;role_key:string;other_role:string;seniority:string;salary_currency:string|null;salary_min:number|null;salary_max:number|null;salary_period:string|null;summary:string;apply_url:string;posted_date:string;expires_date:string;status:string;deleted_at:string|null;source_type?:string;full_description?:string;company_approved?:boolean;suggested_practice_role?:string|null };
export type Preferences = { roles:string[];arrangements:string[];employment_types:string[];countries:string[] };
export const EMPTY_PREFERENCES: Preferences = { roles:[], arrangements:[], employment_types:[], countries:[] };
export type Filters = Preferences & { keyword:string;location:string;days:string;salary:string;sort:string;seniority:string };
export function available(j: Job, today=new Date().toISOString().slice(0,10)) { return j.status==='published'&&!j.deleted_at&&j.expires_date>=today; }
export function matchScore(j:Job,p:Preferences,target:string|null) { return (j.role_key===target?4:0)+(p.roles.includes(j.role_key)?3:0)+(p.arrangements.includes(j.arrangement)?2:0)+(p.employment_types.includes(j.employment)?2:0)+(p.countries.some(c=>c.toLowerCase()===j.country.toLowerCase())?2:0); }
export function filterJobs(jobs:Job[], f:Filters,p:Preferences,target:string|null, now=new Date()) {
  const since = f.days ? new Date(now.getTime()-Number(f.days)*86400000).toISOString().slice(0,10) : '';
  return jobs.filter(j=>available(j,now.toISOString().slice(0,10))&&(!f.roles.length||f.roles.includes(j.role_key))&&(!f.arrangements.length||f.arrangements.includes(j.arrangement))&&(!f.employment_types.length||f.employment_types.includes(j.employment))&&(!f.countries.length||f.countries.some(c=>c.toLowerCase()===j.country.toLowerCase()))&&(!f.location||`${j.city} ${j.country}`.toLowerCase().includes(f.location.toLowerCase()))&&(!f.keyword||`${j.title} ${j.company}`.toLowerCase().includes(f.keyword.toLowerCase()))&&(!since||j.posted_date>=since)&&(!f.salary||(j.salary_min!==null&&j.salary_min>=Number(f.salary))));
}
export function salaryLabel(j:Job) { if(j.salary_min===null&&j.salary_max===null)return null; return `${j.salary_currency??''} ${j.salary_min?.toLocaleString()??'—'}${j.salary_max!==null?' – '+j.salary_max.toLocaleString(): '+'} / ${j.salary_period??'year'}`; }
export function failureState(count:number,success:boolean) { const failures=success?0:count+1; return { failures,hide:failures>=3 }; }