import { describe, it, expect } from 'vitest';
import { isPersonalEmail, domainMatch, submissionLimitProblem, employerJobSchema, waitlistSchema, addDays, baseDomain } from './employer';

const ALLOW = ['greenhouse.io', 'lever.co', 'ashbyhq.com', 'workable.com', 'smartrecruiters.com'];
const TODAY = '2026-11-15';
const job = (over: Record<string, unknown> = {}) => ({
  token: 'x'.repeat(40), submitter_name: 'Sam', title: 'Data Analyst', company: 'Acme', company_website: '', city: 'Lagos', country: 'Nigeria',
  arrangement: 'remote', employment: 'full-time', role_key: 'data_analyst', other_role: '', seniority: 'entry',
  salary_currency: null, salary_min: null, salary_max: null, salary_period: null, summary: 'Analyse sales data.', apply_url: 'https://acme.com/jobs/1',
  expires_date: addDays(TODAY, 30), practice_text: '', practice_consent: false, authorised: true, genuine: true, no_fees: true, terms: true, join_waitlist: false, ...over,
});

describe('personal email domains', () => {
  it('flags gmail, outlook and yahoo variants', () => {
    expect(isPersonalEmail('a@gmail.com')).toBe(true);
    expect(isPersonalEmail('a@Outlook.com')).toBe(true);
    expect(isPersonalEmail('a@yahoo.fr')).toBe(true);
  });
  it('accepts company domains', () => { expect(isPersonalEmail('hr@acme.co.uk')).toBe(false); });
});

describe('apply-link domain match', () => {
  it('matches the submitter email domain, including subdomains', () => {
    expect(domainMatch('https://careers.acme.com/1', 'hr@acme.com', ALLOW)).toBe('email_domain');
    expect(domainMatch('https://acme.com/1', 'hr@uk.acme.com', ALLOW)).toBe('email_domain');
  });
  it('matches a known hiring-software domain', () => { expect(domainMatch('https://boards.greenhouse.io/acme/1', 'hr@acme.com', ALLOW)).toBe('hiring_software'); });
  it('flags a mismatch', () => {
    expect(domainMatch('https://other.com/1', 'hr@acme.com', ALLOW)).toBe('mismatch');
    expect(domainMatch('https://acme.com.evil.net/1', 'hr@acme.com', ALLOW)).toBe('mismatch');
  });
  it('uses the staff-edited list', () => { expect(domainMatch('https://jobs.example-ats.com/1', 'hr@acme.com', ['example-ats.com'])).toBe('hiring_software'); });
  it('handles two-part country domains', () => { expect(baseDomain('mail.acme.co.uk')).toBe('acme.co.uk'); });
});

describe('per-email submission limits', () => {
  const limits = { daily: 3, pending: 10 };
  it('allows the 3rd submission today, refuses the 4th', () => {
    expect(submissionLimitProblem(2, 2, limits)).toBeNull();
    expect(submissionLimitProblem(3, 3, limits)).toMatch(/up to 3 jobs per day/);
  });
  it('refuses when 10 are already pending', () => { expect(submissionLimitProblem(0, 10, limits)).toMatch(/10 jobs waiting/); });
});

describe('employer job form', () => {
  const schema = employerJobSchema(TODAY);
  it('accepts a complete job', () => { expect(schema.safeParse(job()).success).toBe(true); });
  it('allows expiry up to 90 days, not 91', () => {
    expect(schema.safeParse(job({ expires_date: addDays(TODAY, 90) })).success).toBe(true);
    expect(schema.safeParse(job({ expires_date: addDays(TODAY, 91) })).success).toBe(false);
  });
  it('requires all four confirmation ticks', () => {
    for (const k of ['authorised', 'genuine', 'no_fees', 'terms']) expect(schema.safeParse(job({ [k]: false })).success).toBe(false);
  });
  it('requires the rights tick when a job description is shared', () => {
    expect(schema.safeParse(job({ practice_text: 'Full JD' })).success).toBe(false);
    expect(schema.safeParse(job({ practice_text: 'Full JD', practice_consent: true })).success).toBe(true);
  });
  it('limits the summary to 600 characters', () => { expect(schema.safeParse(job({ summary: 'a'.repeat(601) })).success).toBe(false); });
  it('refuses non-HTTPS or private apply links', () => {
    expect(schema.safeParse(job({ apply_url: 'http://acme.com/1' })).success).toBe(false);
    expect(schema.safeParse(job({ apply_url: 'https://10.0.0.1/1' })).success).toBe(false);
  });
});

describe('waitlist form', () => {
  const base = { full_name: '', email: 'hr@acme.com', company: '', job_title: '', company_size: null, country: '', roles: [], other_role: '', hiring_types: [], arrangements: [], hires_per_year: null, message: '', consent: true };
  it('needs only a work email and consent', () => { expect(waitlistSchema.safeParse(base).success).toBe(true); });
  it('requires the consent tick', () => { expect(waitlistSchema.safeParse({ ...base, consent: false }).success).toBe(false); });
  it('does not reject personal emails (they are flagged instead)', () => { expect(waitlistSchema.safeParse({ ...base, email: 'me@gmail.com' }).success).toBe(true); });
});
