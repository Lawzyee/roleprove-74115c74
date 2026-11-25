import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { postingSchema, expiryProblem, reviewRequired, criticalEdit, postingFlags, dateAfter, type PostingInput } from './employer-jobs';
import { samplePosting, CANDIDATE_DATA_TABLES } from './employer-jobs.fixtures';
describe('employer posting rules', () => {
  it('defaults expiry to 30 days', () => { const now = Date.parse('2026-11-25'); expect(dateAfter(30, now)).toBe('2026-12-25'); });
  it('accepts at most 90 days from today', () => { const now = Date.parse('2026-11-25'); expect(expiryProblem('2027-02-23', now)).toBeNull(); expect(expiryProblem('2027-02-24', now)).not.toBeNull(); });
  it('refuses past expiry dates', () => expect(expiryProblem('2026-11-24', Date.parse('2026-11-25'))).not.toBeNull());
  it('limits summaries to 600 characters', () => expect(postingSchema.safeParse({ ...samplePosting('https://example.com'), summary: 'x'.repeat(601) }).success).toBe(false));
  it('limits descriptions to 6000 characters', () => expect(postingSchema.safeParse({ ...samplePosting('https://example.com'), full_description: 'x'.repeat(6001) }).success).toBe(false));
  it('requires the genuine-job tick', () => expect(postingSchema.safeParse({ ...samplePosting('https://example.com'), genuine: false }).success).toBe(false));
  it('requires the no-application-fee tick', () => expect(postingSchema.safeParse({ ...samplePosting('https://example.com'), no_fee: false }).success).toBe(false));
  it('requires company authorisation', () => expect(postingSchema.safeParse({ ...samplePosting('https://example.com'), authorised: false }).success).toBe(false));
  it('requires Employer Terms acceptance', () => expect(postingSchema.safeParse({ ...samplePosting('https://example.com'), terms: false }).success).toBe(false));
  it('requires practice-text rights only when text exists', () => { expect(postingSchema.safeParse({ ...samplePosting('https://example.com'), practice_rights: false }).success).toBe(false); expect(postingSchema.safeParse({ ...samplePosting('https://example.com'), practice_text: '', practice_rights: false }).success).toBe(true); });
  it('accepts only external link, RoleProve or both as application methods', () => { expect(postingSchema.safeParse({ ...samplePosting('https://example.com'), application_method: 'native' }).success).toBe(false); for (const m of ['external_link', 'roleprove', 'both']) expect(postingSchema.safeParse({ ...samplePosting('https://example.com'), application_method: m }).success).toBe(true); });
  it('requires review until three distinct approvals', () => { expect(reviewRequired(false, 2, 3)).toBe(true); expect(reviewRequired(false, 3, 3)).toBe(false); });
  it('keeps forced-review companies in review', () => expect(reviewRequired(true, 20, 3)).toBe(true));
  it('apply-link edits are critical', () => expect(criticalEdit({ apply_url: 'old' }, { apply_url: 'new' })).toBe(true));
  it('title edits are critical', () => expect(criticalEdit({ title: 'old' }, { title: 'new' })).toBe(true));
  it('description edits are critical', () => expect(criticalEdit({ full_description: 'old' }, { full_description: 'new' })).toBe(true));
  it('summary and expiry edits are not critical', () => expect(criticalEdit({ summary: 'old', expires_date: 'old' }, { summary: 'new', expires_date: 'new' })).toBe(false));
  it('flags payment requests', () => expect(postingFlags({ ...samplePosting('https://example.com'), summary: 'send money to apply' }, 'example.com', [], false)).toContain('Possible payment request'));
  it('flags mismatched domains', () => expect(postingFlags(samplePosting('https://another.com'), 'example.com', [], false)).toContain('Apply-link domain differs from company domain'));
  it('respects the hiring-software allow list', () => expect(postingFlags(samplePosting('https://greenhouse.io/a'), 'example.com', ['greenhouse.io'], false)).not.toContain('Apply-link domain differs from company domain'));
  it('flags duplicates', () => expect(postingFlags(samplePosting('https://example.com'), 'example.com', [], true)).toContain('Duplicate active job'));
  it('flags short descriptions', () => expect(postingFlags({ ...samplePosting('https://example.com'), full_description: 'short' }, 'example.com', [], false)).toContain('Very short description'));
});
describe('candidate table separation inventory', () => {
  // Every generated table must be classified, so a future table cannot silently escape the inventory.
  const sharedOrStaff = ['account_types', 'app_settings', 'billing_trial_history', 'billing_usage', 'companies', 'company_audit_log', 'company_invites', 'company_join_requests', 'company_members', 'company_staff_notes', 'data_exports', 'employer_rate_hits', 'employer_sessions', 'employer_waitlist', 'employer_jobs', 'employer_job_events', 'job_applications', 'application_access_log', 'job_sources', 'legal_acceptances', 'notification_settings', 'notifications', 'portfolio_rate', 'portfolio_reports', 'profiles', 'roles', 'subscriptions', 'support_attachments', 'support_messages', 'support_tickets'];
  const types = readFileSync('src/integrations/supabase/types.ts', 'utf8');
  const names = [...types.matchAll(/^      (\w+): \{\n        Row:/gm)].map(m => m[1]);
  const sql = readdirSync('drizzle/migrations').filter(n => n.endsWith('.sql')).map(n => readFileSync(`drizzle/migrations/${n}`, 'utf8')).join('\n');
  it('classifies every current database table', () => { expect(names.length).toBeGreaterThan(40); expect(names.filter(n => ![...CANDIDATE_DATA_TABLES, ...sharedOrStaff].includes(n))).toEqual([]); });
  for (const table of CANDIDATE_DATA_TABLES) it(`${table} has a restrictive not-employer policy`, () => {
    expect(names).toContain(table);
    // The current migrations install these policies from explicit arrays, never inferred from table names.
    expect(sql).toContain(`'${table}'`);
    expect(sql).toMatch(/CREATE POLICY %I ON public\.%I AS RESTRICTIVE FOR ALL TO authenticated USING \(NOT public\.is_employer\(auth\.uid\(\)\)\) WITH CHECK \(NOT public\.is_employer\(auth\.uid\(\)\)\)/);
    const arrays = [...sql.matchAll(/FOREACH t IN ARRAY ARRAY\[([^\]]+)\][\s\S]*?END LOOP/g)].filter(m => m[0].includes("t||'_not_employer'") || m[0].includes("t || '_not_employer'"));
    expect(arrays.some(m => m[1].includes(`'${table}'`))).toBe(true);
  });
  it('keeps default limits at 10 active jobs, 5 daily submissions and 12 months retention', () => { const m = readFileSync('drizzle/migrations/0021_employer_job_posting.sql', 'utf8'); expect(m).toContain('employer_active_jobs integer NOT NULL DEFAULT 10'); expect(m).toContain('employer_daily_jobs integer NOT NULL DEFAULT 5'); expect(m).toContain('employer_job_retention_months integer NOT NULL DEFAULT 12'); });
});