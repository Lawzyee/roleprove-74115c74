import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyProblem, statusChangeProblem, hourKey, retentionDue, acceptsRoleProve, acceptsExternal } from './applications';

const job = (o: Partial<{ status: string; expires_date: string; application_method: string }> = {}) => ({ status: 'published', expires_date: '2026-12-31', application_method: 'roleprove', ...o });
const ok = { status: 'approved', delete_after: null };
const today = '2026-11-25';
describe('apply in RoleProve rules', () => {
  it('shows Apply with RoleProve only for roleprove or both', () => { expect(acceptsRoleProve('roleprove')).toBe(true); expect(acceptsRoleProve('both')).toBe(true); expect(acceptsRoleProve('external_link')).toBe(false); });
  it('keeps the external apply link for external and both, not roleprove-only', () => { expect(acceptsExternal('external_link')).toBe(true); expect(acceptsExternal('both')).toBe(true); expect(acceptsExternal('roleprove')).toBe(false); });
  it('allows applying to a published, unexpired roleprove job of an approved company', () => expect(applyProblem(job(), ok, today)).toBeNull());
  it('refuses external-link-only jobs', () => expect(applyProblem(job({ application_method: 'external_link' }), ok, today)).not.toBeNull());
  it('refuses expired jobs', () => expect(applyProblem(job({ expires_date: '2026-11-24' }), ok, today)).not.toBeNull());
  for (const s of ['paused', 'closed', 'expired', 'draft', 'pending_review']) it(`refuses ${s} jobs`, () => expect(applyProblem(job({ status: s }), ok, today)).not.toBeNull());
  it('refuses jobs of suspended companies', () => expect(applyProblem(job(), { status: 'suspended', delete_after: null }, today)).not.toBeNull());
  it('refuses jobs of companies scheduled for deletion', () => expect(applyProblem(job(), { status: 'approved', delete_after: '2026-12-01' }, today)).not.toBeNull());
  it('lets owners and recruiters set shortlisted, interview or not progressed', () => { for (const r of ['owner', 'recruiter']) for (const s of ['shortlisted', 'interview', 'not_progressed']) expect(statusChangeProblem('viewed', s, r)).toBeNull(); });
  it('stops viewers changing status', () => expect(statusChangeProblem('viewed', 'shortlisted', 'viewer')).not.toBeNull());
  it('allows no free-form or other statuses', () => { expect(statusChangeProblem('viewed', 'hired', 'owner')).not.toBeNull(); expect(statusChangeProblem('viewed', 'withdrawn', 'owner')).not.toBeNull(); });
  it('cannot change withdrawn or closed applications', () => { expect(statusChangeProblem('withdrawn', 'shortlisted', 'owner')).not.toBeNull(); expect(statusChangeProblem('job_closed', 'shortlisted', 'owner')).not.toBeNull(); });
  it('batches new-application notices per job per hour', () => { const t = Date.parse('2026-11-25T10:05:00Z'); expect(hourKey('j', t)).toBe(hourKey('j', t + 50 * 60000)); expect(hourKey('j', t)).not.toBe(hourKey('j', t + 60 * 60000)); });
  it('deletes shared data 6 months after the job ended, not before', () => { const now = Date.parse('2026-11-25T00:00:00Z'); expect(retentionDue('2026-05-24T00:00:00Z', 6, now)).toBe(true); expect(retentionDue('2026-05-26T00:00:00Z', 6, now)).toBe(false); expect(retentionDue(null, 6, now)).toBe(false); });
  it('defaults to 10 applications a day, 60 opens an hour and 6 months retention', () => { const m = readFileSync('drizzle/migrations/0023_apply_in_roleprove.sql', 'utf8'); expect(m).toContain('candidate_daily_applications integer NOT NULL DEFAULT 10'); expect(m).toContain('application_opens_per_hour integer NOT NULL DEFAULT 60'); expect(m).toContain('application_retention_months integer NOT NULL DEFAULT 6'); });
  it('lists only public columns in the Job center (no select *)', () => { const f = readFileSync('src/lib/job-center.functions.ts', 'utf8'); expect(f).not.toMatch(/from\('job_center_jobs'\)\.select\('\*'\)/); expect(f).not.toContain('job_center_jobs(*)'); for (const c of ['source_ref', 'external_id', 'apply_url_hash']) expect(f.match(/PUBLIC_JOB_COLS='([^']+)'/)?.[1]).not.toContain(c); });
  it('has no applicant list download, CSV or score sorting', () => { const code = ['src/lib/applications.server.ts', 'src/lib/applications.functions.ts', 'src/routes/_authenticated/employer.applicants.$jobId.tsx'].map(f => readFileSync(f, 'utf8')).join('\n'); expect(code).not.toMatch(/csv|download=|order\('score|sort\(/i); });
});
