import { describe, expect, it } from 'vitest';
import { canGenerate, subscriptionHasAccess, type BillingAccess } from './billing';
const now = Date.parse('2026-10-18T13:17:00Z');
const access: BillingAccess = { enforced: true, trialActive: false, trialDaysLeft: 0, trialEndsAt: null, paid: false, subscriptionStatus: 'none', periodEnd: null, cancelAtPeriodEnd: false, simulationsLeft: 3, interviewPrepLeft: 1 };
describe('confirmed subscription access', () => {
  it('keeps cancellation access until paid period end', () => {
    expect(subscriptionHasAccess('canceled', '2026-10-19T13:17:00Z', null, now)).toBe(true);
    expect(subscriptionHasAccess('canceled', '2026-10-18T13:17:00Z', null, now)).toBe(false);
  });
  it('grants exactly seven days of failed-payment grace', () => {
    expect(subscriptionHasAccess('past_due', null, '2026-10-11T13:17:01Z', now)).toBe(true);
    expect(subscriptionHasAccess('past_due', null, '2026-10-11T13:17:00Z', now)).toBe(false);
  });
  it('never blocks while launch switch is off', () => {
    expect(canGenerate({ ...access, enforced: false, simulationsLeft: 0 }, 'simulation')).toBe(true);
  });
  it('unlocks unlimited paid practice', () => {
    expect(canGenerate({ ...access, paid: true, simulationsLeft: 0, interviewPrepLeft: 0 }, 'simulation')).toBe(true);
    expect(canGenerate({ ...access, paid: true, simulationsLeft: 0, interviewPrepLeft: 0 }, 'interview_prep')).toBe(true);
  });
  it('allows the remaining three simulations and refuses when exhausted', () => {
    expect(canGenerate(access, 'simulation')).toBe(true);
    expect(canGenerate({ ...access, simulationsLeft: 0 }, 'simulation')).toBe(false);
  });
  it('allows one interview session and refuses when exhausted', () => {
    expect(canGenerate(access, 'interview_prep')).toBe(true);
    expect(canGenerate({ ...access, interviewPrepLeft: 0 }, 'interview_prep')).toBe(false);
  });
  it('unlocks unlimited practice during a card-free trial', () => {
    expect(canGenerate({ ...access, trialActive: true, trialDaysLeft: 21, simulationsLeft: 0 }, 'simulation')).toBe(true);
  });
});