// Shared rules for employer accounts and company review (browser + server).
import { z } from 'zod';
import { COMPANY_SIZES, baseDomain, emailDomain } from './employer';

export const INDUSTRIES = ['technology', 'finance', 'retail and ecommerce', 'healthcare', 'education', 'professional services', 'manufacturing', 'public sector and nonprofit', 'media and marketing', 'other'] as const;
export const COMPANY_STATUSES = ['pending', 'approved', 'rejected', 'suspended'] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];
export const MEMBER_ROLES = ['owner', 'recruiter', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export const INVITE_ROLES = ['recruiter', 'viewer'] as const;
export const STAFF_ACTIONS = ['approve', 'reject', 'suspend', 'reinstate'] as const;
export type StaffAction = (typeof STAFF_ACTIONS)[number];

/** Same answer whether the email belongs to a candidate, an employer or nobody we can tell apart. */
export const ACCOUNT_EXISTS_MESSAGE = 'Use a different work email or contact support.';
export const WORK_EMAIL_MESSAGE = 'Please use your work email address (for example jane.doe@yourcompany.com). We can\u2019t accept personal or temporary email addresses for employer accounts.';
export const LEVEL_EMAIL = 'Work email confirmed';
export const LEVEL_REVIEWED = 'Reviewed by RoleProve';

/** Refuses personal and disposable domains (both lists are staff-editable settings). */
export function workEmailProblem(email: string, personal: readonly string[], disposable: readonly string[]): string | null {
  const d = emailDomain(email);
  if (!d || !d.includes('.')) return 'Enter a valid email address.';
  const lists = [...personal, ...disposable].map((x) => x.trim().toLowerCase());
  if (lists.includes(d) || /^(yahoo|hotmail|outlook|live)\.[a-z.]+$/.test(d)) return WORK_EMAIL_MESSAGE;
  return null;
}

/** Level 1: the confirmed email's domain belongs to the company website's domain. */
export function websiteMatchesDomain(website: string, domain: string): boolean {
  let host = '';
  try { host = new URL(website).hostname.toLowerCase().replace(/^www\./, ''); } catch { return false; }
  return baseDomain(host) === baseDomain(domain);
}

export function verificationLevels(c: { status: CompanyStatus; website: string; email_domain: string }, ownerEmailConfirmed: boolean): string[] {
  const out: string[] = [];
  if (ownerEmailConfirmed && websiteMatchesDomain(c.website, c.email_domain)) out.push(LEVEL_EMAIL);
  if (c.status === 'approved') out.push(LEVEL_REVIEWED);
  return out;
}

/** What a company may do at each status. Only approved companies get anything beyond their own profile. */
export function companyAccess(status: CompanyStatus) {
  return { editProfile: status === 'pending' || status === 'approved', full: status === 'approved' };
}

/** Staff status changes: which transitions are allowed and whether a reason is required. */
export const TRANSITIONS: Record<StaffAction, { from: CompanyStatus[]; to: CompanyStatus; reason: boolean }> = {
  approve: { from: ['pending'], to: 'approved', reason: false },
  reject: { from: ['pending'], to: 'rejected', reason: true },
  suspend: { from: ['approved'], to: 'suspended', reason: true },
  reinstate: { from: ['suspended', 'rejected'], to: 'approved', reason: false },
};
export function transitionProblem(action: StaffAction, from: CompanyStatus, reason: string): string | null {
  const t = TRANSITIONS[action];
  if (!t.from.includes(from)) return `A ${from} company can't be changed with "${action}".`;
  if (t.reason && !reason.trim()) return 'Give a reason.';
  return null;
}

export function inviteProblem(email: string, companyDomain: string, used: number, maxSeats: number): string | null {
  if (emailDomain(email) !== companyDomain) return `Invites can only go to @${companyDomain} email addresses.`;
  if (used >= maxSeats) return `Your company has reached its limit of ${maxSeats} seats.`;
  return null;
}
export function inviteExpired(expiresAt: string, now = Date.now()) { return new Date(expiresAt).getTime() <= now; }

/** An owner with other members must hand over ownership before leaving or deleting the account. */
export function deletionProblem(role: MemberRole | null, memberCount: number): string | null {
  if (role === 'owner' && memberCount > 1) return 'Transfer company ownership to another member before deleting your account.';
  return null;
}

const text = (max: number) => z.string().trim().max(max);
const httpsUrl = (msg: string) => z.string().trim().max(300).refine((v) => { try { const u = new URL(v); return u.protocol === 'https:' && u.hostname.includes('.'); } catch { return false; } }, msg);
export const companySchema = z.object({
  name: text(180).min(1, 'Enter the company name.'),
  website: httpsUrl('Enter the company website, starting with https://'),
  country: text(100).min(1, 'Enter the country.'),
  size_band: z.enum(COMPANY_SIZES),
  industry: z.enum(INDUSTRIES),
  description: text(600),
  registration_number: text(60),
  public_page_url: z.union([z.literal(''), httpsUrl('Use a public https:// link.')]),
});
export type CompanyInput = z.infer<typeof companySchema>;

export const employerSignUpSchema = z.object({
  name: text(180).min(1, 'Enter your name.'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
  company_name: text(180).min(1, 'Enter your company name.'),
  job_title: text(120).optional(),
  terms: z.literal(true, { errorMap: () => ({ message: 'Please accept the Employer Terms and Privacy Policy.' }) }),
  website: z.string().max(300).optional(),
});
