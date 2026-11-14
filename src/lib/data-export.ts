/** Re-authentication must be this recent to request an export. */
export const REAUTH_MAX_AGE_SECONDS = 10 * 60;
export const EXPORTS_PER_DAY = 1;

/** Latest sign-in time (seconds) from the session's amr claim, or null. */
export function lastSignInAt(claims: { amr?: unknown }): number | null {
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  const times = amr
    .filter((a): a is { method: string; timestamp: number } => !!a && typeof a === 'object' && typeof (a as { timestamp?: unknown }).timestamp === 'number')
    .filter((a) => a.method === 'password' || a.method === 'oauth' || a.method === 'otp')
    .map((a) => a.timestamp);
  return times.length ? Math.max(...times) : null;
}

export function isRecentSignIn(claims: { amr?: unknown }, nowSeconds = Date.now() / 1000) {
  const t = lastSignInAt(claims);
  return t != null && nowSeconds - t <= REAUTH_MAX_AGE_SECONDS;
}
