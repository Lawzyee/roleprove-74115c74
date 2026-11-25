import { z } from 'zod';
import { ARRANGEMENTS, EMPLOYMENT, applyLinkProblem } from './job-center';

export const COMPANY_SIZES = ['1-10','11-50','51-200','201-1000','1000+'] as const;
export const HIRING_TYPES = ['full-time','part-time','contract or freelance','internship'] as const;
export const HIRES_PER_YEAR = ['1-2','3-10','11+'] as const;
export const EMPLOYER_ROLES = ['data_analyst','customer_support','other'] as const;
export const REJECT_REASONS = ['looks like a scam','duplicate','link not working','not a real job','other'] as const;
export const MAX_EXPIRY_DAYS = 90;
export const DEFAULT_EXPIRY_DAYS = 30;
export const WAITLIST_MESSAGE = 'Thanks. If this email isn\u2019t already confirmed on our list, we\u2019ve sent a confirmation link. Please check your inbox.';

/** Free/personal mailbox providers. Waitlist: flagged for staff. Job submission: refused. */
export const PERSONAL_DOMAINS = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','ymail.com','rocketmail.com','hotmail.com','hotmail.co.uk','outlook.com','live.com','live.co.uk','msn.com',
  'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me','gmx.com','gmx.net','gmx.de','mail.com','yandex.com','yandex.ru','zohomail.com',
  'tutanota.com','tuta.io','fastmail.com','hey.com','qq.com','163.com','126.com','web.de','mail.ru','inbox.com','btinternet.com','sky.com','virginmedia.com',
]);
export function emailDomain(email: string): string { return email.trim().toLowerCase().split('@').pop()?.replace(/\.$/, '') ?? ''; }
export function isPersonalEmail(email: string): boolean {
  const d = emailDomain(email);
  return PERSONAL_DOMAINS.has(d) || /^(yahoo|hotmail|outlook|live)\.[a-z.]+$/.test(d);
}
/** Registrable-ish base: example.com, example.co.uk. */
export function baseDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const sld = parts[parts.length - 2];
  const take = parts[parts.length - 1].length === 2 && ['co','com','org','net','ac','gov','ltd','plc'].includes(sld) ? 3 : 2;
  return parts.slice(-take).join('.');
}
const under = (host: string, d: string) => host === d || host.endsWith('.' + d);
export type DomainMatch = 'email_domain' | 'hiring_software' | 'mismatch';
/** Does the apply link's website belong to the submitter's email domain or a known hiring-software domain? */
export function domainMatch(applyUrl: string, email: string, allowList: string[]): DomainMatch {
  let host = '';
  try { host = new URL(applyUrl).hostname.toLowerCase().replace(/\.$/, ''); } catch { return 'mismatch'; }
  const ed = emailDomain(email);
  if (ed && (under(host, ed) || under(host, baseDomain(ed)))) return 'email_domain';
  if (allowList.some(d => d && under(host, d.trim().toLowerCase()))) return 'hiring_software';
  return 'mismatch';
}
export function addDays(date: string, days: number) { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export type SubmissionLimits = { daily: number; pending: number };
export function submissionLimitProblem(today: number, pending: number, limits: SubmissionLimits): string | null {
  if (today >= limits.daily) return `You can submit up to ${limits.daily} jobs per day from this email. Please try again tomorrow.`;
  if (pending >= limits.pending) return `You already have ${pending} jobs waiting for review. Please wait until some are reviewed.`;
  return null;
}
const text = (max: number) => z.string().trim().max(max);
const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
export const waitlistSchema = z.object({
  full_name: text(180), email, company: text(180), job_title: text(180),
  company_size: z.enum(COMPANY_SIZES).nullable(), country: text(100),
  roles: z.array(z.enum(EMPLOYER_ROLES)).max(3), other_role: text(100),
  hiring_types: z.array(z.enum(HIRING_TYPES)).max(4), arrangements: z.array(z.enum(ARRANGEMENTS)).max(3),
  hires_per_year: z.enum(HIRES_PER_YEAR).nullable(), message: text(2000),
  consent: z.literal(true, { errorMap: () => ({ message: 'Please agree to be contacted.' }) }),
  website: z.string().max(300).optional(),
}).superRefine((v, c) => { if (v.roles.includes('other') && !v.other_role) c.addIssue({ code: 'custom', path: ['other_role'], message: 'Name the other role.' }); });
export type WaitlistInput = z.infer<typeof waitlistSchema>;
export const workEmailSchema = z.object({ email, website: z.string().max(300).optional() });
export function employerJobSchema(today = new Date().toISOString().slice(0, 10)) {
  return z.object({
    token: z.string().min(20).max(200), website: z.string().max(300).optional(),
    submitter_name: text(180).min(1, 'Enter your name.'),
    title: text(180).min(1, 'Enter the job title.'), company: text(180).min(1, 'Enter the company name.'),
    company_website: text(2000), city: text(100), country: text(100),
    arrangement: z.enum(ARRANGEMENTS), employment: z.enum(EMPLOYMENT), role_key: z.enum(EMPLOYER_ROLES), other_role: text(100),
    seniority: z.enum(['entry','mid','senior']),
    salary_currency: text(3).nullable(), salary_min: z.number().nonnegative().nullable(), salary_max: z.number().nonnegative().nullable(), salary_period: z.enum(['hour','month','year']).nullable(),
    summary: text(600).min(1, 'Add a short summary.'), apply_url: text(2000),
    expires_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    practice_text: text(20000), practice_consent: z.boolean(),
    authorised: z.literal(true, { errorMap: () => ({ message: 'Confirm you are authorised to post for this company.' }) }),
    genuine: z.literal(true, { errorMap: () => ({ message: 'Confirm the job is genuine, lawful and non-discriminatory.' }) }),
    no_fees: z.literal(true, { errorMap: () => ({ message: 'Confirm candidates are never charged to apply.' }) }),
    terms: z.literal(true, { errorMap: () => ({ message: 'Please accept the Employer Terms.' }) }),
    join_waitlist: z.boolean(),
  }).superRefine((v, c) => {
    const p = applyLinkProblem(v.apply_url); if (p) c.addIssue({ code: 'custom', path: ['apply_url'], message: p });
    if (v.company_website && applyLinkProblem(v.company_website)) c.addIssue({ code: 'custom', path: ['company_website'], message: 'Use a public HTTPS website.' });
    if (v.role_key === 'other' && !v.other_role) c.addIssue({ code: 'custom', path: ['other_role'], message: 'Name the role.' });
    if (v.salary_min !== null && v.salary_max !== null && v.salary_max < v.salary_min) c.addIssue({ code: 'custom', path: ['salary_max'], message: 'Maximum must be at least the minimum.' });
    if ((v.salary_min !== null || v.salary_max !== null) && (!v.salary_currency || !v.salary_period)) c.addIssue({ code: 'custom', path: ['salary_currency'], message: 'Choose currency and salary period.' });
    if (v.expires_date < today || v.expires_date > addDays(today, MAX_EXPIRY_DAYS)) c.addIssue({ code: 'custom', path: ['expires_date'], message: `Choose an expiry date within the next ${MAX_EXPIRY_DAYS} days.` });
    if (v.practice_text && !v.practice_consent) c.addIssue({ code: 'custom', path: ['practice_consent'], message: 'Confirm you have the right to share the job description.' });
  });
}
export type EmployerJobInput = z.infer<ReturnType<typeof employerJobSchema>>;
export const PROVENANCE_BADGE = 'Submitted via a confirmed company email address';
