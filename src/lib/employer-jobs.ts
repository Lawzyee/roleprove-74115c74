import { z } from 'zod';
import { ARRANGEMENTS, EMPLOYMENT, applyLinkProblem } from './job-center';
import { domainMatch } from './employer';

export const POSTING_STATUSES = ['draft', 'pending_review', 'published', 'paused', 'closed', 'expired'] as const;
export const POSTING_REJECT_REASONS = ['looks like a scam', 'misleading information', 'discriminatory wording', 'link broken', 'other'] as const;
export const dateAfter = (days: number, now = Date.now()) => new Date(now + days * 86400000).toISOString().slice(0, 10);
const text = (max: number) => z.string().trim().max(max);
export const postingSchema = z.object({
  title: text(180).min(1), city: text(100), country: text(100).min(1), arrangement: z.enum(ARRANGEMENTS), employment: z.enum(EMPLOYMENT),
  role_key: z.enum(['data_analyst', 'customer_support', 'other']), other_role: text(100), seniority: z.enum(['entry', 'mid', 'senior']),
  salary_currency: text(3).nullable(), salary_min: z.number().nonnegative().nullable(), salary_max: z.number().nonnegative().nullable(), salary_period: z.enum(['hour', 'month', 'year']).nullable(),
  summary: text(600).min(1), full_description: text(6000).min(1), apply_url: text(2000).refine(v => !applyLinkProblem(v), 'Use a safe public HTTPS apply link.'),
  expires_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), application_method: z.literal('external_link').default('external_link'),
  suggested_practice_role: z.enum(['data_analyst', 'customer_support']).nullable(), practice_text: text(20000),
  practice_rights: z.boolean(), genuine: z.literal(true), no_fee: z.literal(true), authorised: z.literal(true), terms: z.literal(true),
}).superRefine((v, c) => {
  if (v.role_key === 'other' && !v.other_role) c.addIssue({ code: 'custom', path: ['other_role'], message: 'Name the role.' });
  if (v.salary_min !== null && v.salary_max !== null && v.salary_max < v.salary_min) c.addIssue({ code: 'custom', path: ['salary_max'], message: 'Maximum must be at least minimum.' });
  if ((v.salary_min !== null || v.salary_max !== null) && (!v.salary_currency || !v.salary_period)) c.addIssue({ code: 'custom', path: ['salary_currency'], message: 'Choose currency and salary period.' });
  if (v.practice_text && !v.practice_rights) c.addIssue({ code: 'custom', path: ['practice_rights'], message: 'Confirm your rights to the practice text.' });
});
export type PostingInput = z.infer<typeof postingSchema>;
export type Posting = { id: string; company_id: string; payload: Omit<PostingInput, 'practice_text'>; practice_text: string; status: typeof POSTING_STATUSES[number]; moderation_reason: string; views: number; apply_clicks: number; version: number; created_at: string };
export function expiryProblem(date: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return 'Choose a valid expiry date.';
  return date < dateAfter(0, now) || date > dateAfter(90, now) ? 'Expiry must be between today and 90 days from now.' : null;
}
export function reviewRequired(force: boolean, approvals: number, threshold = 3) { return force || approvals < threshold; }
export function criticalEdit(previous: Record<string, unknown>, next: Record<string, unknown>) { return ['apply_url', 'title', 'full_description'].some(k => previous[k] !== next[k]); }
export function postingFlags(p: Pick<PostingInput, 'apply_url' | 'title' | 'full_description' | 'summary' | 'salary_min' | 'salary_max'>, domain: string, allow: string[], duplicate: boolean) {
  const flags: string[] = [];
  if (domainMatch(p.apply_url, `work@${domain}`, allow) === 'mismatch') flags.push('Apply-link domain differs from company domain');
  if (duplicate) flags.push('Duplicate active job');
  if (/pay (?:a |the )?fee|send money|payment required|pay to apply/i.test(`${p.title} ${p.summary} ${p.full_description}`)) flags.push('Possible payment request');
  if (p.full_description.length < 100) flags.push('Very short description');
  if ((p.salary_min ?? 0) > 10000000 || (p.salary_max ?? 0) > 10000000) flags.push('Unusual salary range');
  return flags;
}