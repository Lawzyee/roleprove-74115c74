// Apply in RoleProve: browser-safe rules shared by candidate and employer screens.
// RULES (do not relax): no ranking, sorting or filtering by score; no automatic status changes by score;
// no bulk export, list download or CSV; employers see only the frozen snapshot's included fields.
export const APPLICATION_STATUSES = ['submitted', 'viewed', 'shortlisted', 'interview', 'not_progressed', 'withdrawn', 'job_closed'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  submitted: 'Submitted', viewed: 'Viewed', shortlisted: 'Shortlisted', interview: 'Interview', not_progressed: 'Not progressed', withdrawn: 'Withdrawn', job_closed: 'Job closed',
};
/** The only statuses a recruiter can set; never free text. */
export const EMPLOYER_STATUSES = ['shortlisted', 'interview', 'not_progressed'] as const;
export type EmployerStatus = (typeof EMPLOYER_STATUSES)[number];
export const ACTIVE_STATUSES: ApplicationStatus[] = ['submitted', 'viewed', 'shortlisted', 'interview', 'not_progressed'];
export const COVER_NOTE_MAX = 1000;
export const APPLY_NOTICE = 'The employer decides about hiring, not RoleProve. Scores are practice-based indicators, not a guarantee of job performance.';
export const NO_RANKING_NOTICE = 'Applicants are listed newest first. RoleProve does not rank, sort or filter applicants by score, and never changes a status automatically.';
export const CV_LINK_SECONDS = 300;
export const APPLY_METHODS = ['external_link', 'roleprove', 'both'] as const;
export const acceptsRoleProve = (method: string | null | undefined) => method === 'roleprove' || method === 'both';
export const acceptsExternal = (method: string | null | undefined) => method !== 'roleprove';

type JobState = { status: string; expires_date: string; application_method: string | null | undefined };
type CompanyState = { status: string; delete_after: string | null };
/** Why a candidate cannot apply now, or null. Expired, closed, paused, suspended-company and external-only jobs refuse. */
export function applyProblem(job: JobState | null, company: CompanyState | null, today = new Date().toISOString().slice(0, 10)): string | null {
  if (!job || !company) return 'This job is not available.';
  if (!acceptsRoleProve(job.application_method)) return 'This job does not accept applications through RoleProve.';
  if (company.status !== 'approved' || company.delete_after) return 'This job is not accepting applications right now.';
  if (job.status !== 'published') return 'This job is not accepting applications right now.';
  if (job.expires_date < today) return 'This job has expired.';
  return null;
}
/** A recruiter may change status only on a live application, only to a fixed status. */
export function statusChangeProblem(current: ApplicationStatus, next: string, role: string): string | null {
  if (role !== 'owner' && role !== 'recruiter') return 'Only owners and recruiters can change status.';
  if (!(EMPLOYER_STATUSES as readonly string[]).includes(next)) return 'Choose a valid status.';
  if (!ACTIVE_STATUSES.includes(current)) return 'This application can no longer be changed.';
  return null;
}
/** Hourly batching key: at most one new-application notice per job per member per hour. */
export const hourKey = (jobId: string, now = Date.now()) => `${jobId}:${new Date(now).toISOString().slice(0, 13)}`;
/** Retention cut-off: N months after the job ended. */
export function retentionDue(endedAt: string | null, months: number, now = Date.now()) {
  if (!endedAt) return false;
  const cutoff = new Date(now); cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return endedAt < cutoff.toISOString();
}
