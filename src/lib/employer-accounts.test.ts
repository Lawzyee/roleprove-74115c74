import { describe, expect, it } from 'vitest';
import { companyAccess, deletionProblem, inviteExpired, inviteProblem, transitionProblem, verificationLevels, workEmailProblem, WORK_EMAIL_MESSAGE, LEVEL_EMAIL, LEVEL_REVIEWED } from './employer-accounts';
import { employerMayOpen as employerMayOpenCheck } from '@/hooks/useAccountKind';

describe('employer account rules', () => {
  it('refuses personal and temporary email domains', () => {
    expect(workEmailProblem('ada@gmail.com', ['gmail.com'], [])).toBe(WORK_EMAIL_MESSAGE);
    expect(workEmailProblem('ada@mailinator.com', [], ['mailinator.com'])).toBe(WORK_EMAIL_MESSAGE);
    expect(workEmailProblem('ada@acme.co.uk', ['gmail.com'], [])).toBeNull();
  });
  it('labels: email level needs a confirmed email on the website domain; reviewed only when approved', () => {
    const c = { status: 'pending' as const, website: 'https://www.acme.com', email_domain: 'acme.com' };
    expect(verificationLevels(c, true)).toEqual([LEVEL_EMAIL]);
    expect(verificationLevels(c, false)).toEqual([]);
    expect(verificationLevels({ ...c, website: 'https://other.com' }, true)).toEqual([]);
    expect(verificationLevels({ ...c, status: 'approved' }, true)).toEqual([LEVEL_EMAIL, LEVEL_REVIEWED]);
  });
  it('only approved companies get full access; suspended and rejected cannot edit', () => {
    expect(companyAccess('approved')).toEqual({ editProfile: true, full: true });
    expect(companyAccess('pending')).toEqual({ editProfile: true, full: false });
    expect(companyAccess('rejected')).toEqual({ editProfile: false, full: false });
    expect(companyAccess('suspended')).toEqual({ editProfile: false, full: false });
  });
  it('reject and suspend need a reason; only allowed transitions', () => {
    expect(transitionProblem('reject', 'pending', ' ')).toBe('Give a reason.');
    expect(transitionProblem('suspend', 'approved', 'fraud')).toBeNull();
    expect(transitionProblem('suspend', 'pending', 'x')).not.toBeNull();
    expect(transitionProblem('approve', 'pending', '')).toBeNull();
  });
  it('invites: same domain only, seat limit, 7-day expiry check', () => {
    expect(inviteProblem('bo@other.com', 'acme.com', 1, 5)).not.toBeNull();
    expect(inviteProblem('bo@acme.com', 'acme.com', 5, 5)).not.toBeNull();
    expect(inviteProblem('bo@acme.com', 'acme.com', 4, 5)).toBeNull();
    expect(inviteExpired('2020-01-01T00:00:00Z')).toBe(true);
  });
  it('an owner with other members must transfer before deleting', () => {
    expect(deletionProblem('owner', 2)).not.toBeNull();
    expect(deletionProblem('owner', 1)).toBeNull();
    expect(deletionProblem('viewer', 3)).toBeNull();
  });
  it('employer accounts may open only the employer area, inbox and support', () => {
    expect(employerMayOpenCheck('/employer/team')).toBe(true);
    expect(employerMayOpenCheck('/inbox')).toBe(true);
    expect(employerMayOpenCheck('/dashboard')).toBe(false);
    expect(employerMayOpenCheck('/application-profile')).toBe(false);
  });
});
