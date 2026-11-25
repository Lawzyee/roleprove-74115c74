import { describe, expect, it } from 'vitest';
import { badgeText, EMAIL_DEFAULTS, isInternalPath } from './notifications';

describe('inbox rules', () => {
  it('accepts internal paths only', () => {
    expect(isInternalPath('/support/abc')).toBe(true);
    expect(isInternalPath('/jobs/tracker')).toBe(true);
    expect(isInternalPath('https://evil.com')).toBe(false);
    expect(isInternalPath('//evil.com')).toBe(false);
    expect(isInternalPath('javascript:alert(1)')).toBe(false);
    expect(isInternalPath('/a b')).toBe(false);
  });
  it('caps the bell at 9+', () => {
    expect(badgeText(0)).toBe(''); expect(badgeText(9)).toBe('9'); expect(badgeText(10)).toBe('9+');
  });
  it('emails only support replies by default', () => {
    expect(EMAIL_DEFAULTS).toEqual({ support_reply: true, support_status: false, job_unavailable: false, data_export_ready: false, account: false, application_update: false });
  });
});
