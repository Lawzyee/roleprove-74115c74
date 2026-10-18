export const PRACTICE_PRICE = 'roleprove_practice_prep_monthly';
export type BillingAccess = {
  enforced: boolean; trialActive: boolean; trialDaysLeft: number; trialEndsAt: string | null;
  paid: boolean; subscriptionStatus: string; periodEnd: string | null; cancelAtPeriodEnd: boolean;
  simulationsLeft: number; interviewPrepLeft: number;
};
export function subscriptionHasAccess(status: string, periodEnd: string | null, pastDueSince: string | null, now = Date.now()) {
  if (status === 'past_due') return pastDueSince !== null && new Date(pastDueSince).getTime() + 7 * 86400000 > now;
  if (status === 'canceled') return periodEnd !== null && new Date(periodEnd).getTime() > now;
  // 1-day renewal buffer: mirrors billing_access_for in the database.
  return ['active', 'trialing'].includes(status) && (periodEnd === null || new Date(periodEnd).getTime() + RENEWAL_BUFFER_MS > now);
}
export function canGenerate(access: BillingAccess, kind: 'simulation' | 'interview_prep') {
  return !access.enforced || access.paid || access.trialActive || (kind === 'simulation' ? access.simulationsLeft : access.interviewPrepLeft) > 0;
}