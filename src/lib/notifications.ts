/** Shared inbox rules (browser + server). */
export const NOTIFICATION_TYPES = ['support_reply', 'support_status', 'job_unavailable', 'data_export_ready', 'account', 'application_update'] as const;
/** Reserved for later builds; the database accepts them but nothing creates them yet. */
export const RESERVED_TYPES = ['employer_message'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const CATEGORY_LABELS: Record<NotificationType, string> = {
  support_reply: 'Support replies',
  support_status: 'Support ticket status changes',
  job_unavailable: 'Saved jobs that close',
  data_export_ready: 'Data export ready',
  account: 'Account and subscription notices',
  application_update: 'Job application updates',
};
export const EMAIL_DEFAULTS: Record<NotificationType, boolean> = {
  support_reply: true, support_status: false, job_unavailable: false, data_export_ready: false, account: false, application_update: false,
};
export const PAGE_SIZE = 20;
export const TITLE_MAX = 120;
export const BODY_MAX = 500;

/** Internal app path only: starts with one slash, no scheme, no protocol-relative URL. */
export function isInternalPath(link: string | null | undefined): link is string {
  return typeof link === 'string' && /^\/[A-Za-z0-9/_?=&.%-]*$/.test(link) && !link.startsWith('//');
}
export function badgeText(unread: number) { return unread <= 0 ? '' : unread > 9 ? '9+' : String(unread); }
