import { describe, expect, it } from 'vitest';
import { isRecentSignIn, REAUTH_MAX_AGE_SECONDS } from './data-export';

describe('data export re-authentication', () => {
  const now = 1_800_000_000;
  it('accepts a password sign-in within 10 minutes', () => {
    expect(REAUTH_MAX_AGE_SECONDS).toBe(600);
    expect(isRecentSignIn({ amr: [{ method: 'password', timestamp: now - 599 }] }, now)).toBe(true);
  });
  it('rejects an older sign-in kept alive by token refresh', () => {
    expect(isRecentSignIn({ amr: [{ method: 'password', timestamp: now - 601 }] }, now)).toBe(false);
  });
  it('rejects sessions with no sign-in time', () => {
    expect(isRecentSignIn({}, now)).toBe(false);
  });
});
