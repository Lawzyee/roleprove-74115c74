// Sign-in / sign-up entry rules shared by the first screen (/), /auth and their tests.
export type EntryKind = 'candidate' | 'employer';
export type SignupChoice = 'seeker' | 'hiring';
export type AuthSearch = { mode?: 'login' | 'signup'; as?: SignupChoice; confirmed?: boolean; confirmationError?: boolean };

/** Where a signed-in person belongs. One sign-in serves both account types. */
export const homeFor = (kind: EntryKind): '/dashboard' | '/employer' => (kind === 'employer' ? '/employer' : '/dashboard');

/** First screen decision for `/`: null = show the sign-in screen. */
export function landingTarget(signedIn: boolean, kind: EntryKind | null | undefined) {
  if (!signedIn || !kind) return null;
  return homeFor(kind);
}

const truthy = (v: unknown) => v === true || v === 'true';
export function parseAuthSearch(s: Record<string, unknown>): AuthSearch {
  const out: AuthSearch = {};
  if (s['mode'] === 'login' || s['mode'] === 'signup') out.mode = s['mode'];
  if (s['as'] === 'seeker' || s['as'] === 'hiring') out.as = s['as'];
  if (truthy(s['confirmed'])) out.confirmed = true;
  if (truthy(s['confirmationError'])) out.confirmationError = true;
  return out;
}

/** The one place form placeholders come from; name boxes always say "Jane Doe". */
export const PLACEHOLDERS = {
  name: 'Jane Doe',
  email: 'jane.doe@example.com',
  workEmail: 'jane.doe@yourcompany.com',
  company: 'Acme Ltd',
  jobTitle: 'Talent Partner',
} as const;

/** Pages that must stay public (never under the signed-in gate). */
export const PUBLIC_ROUTE_FILES = [
  'index.tsx', 'about.tsx', 'auth.tsx', 'auth_.confirm.tsx', 'reset-password.tsx', 'terms.tsx', 'privacy.tsx', 'cookies.tsx', 'help.tsx',
  'employers.tsx', 'posting-standards.tsx', 'employer-terms.tsx', 'employers_.confirm.tsx', 'employers_.remove.tsx',
  'employers_.leave.tsx', 'employers_.invite.tsx', 'employers_.submit.tsx', 'employers_.sign-up.tsx', 'p',
] as const;

export type AuthView = 'login' | 'choose' | 'seeker' | 'hiring';
/** Which screen /auth opens on: sign-in by default; sign-up shows the choice step unless a choice is preselected. */
export function initialView(search: AuthSearch): AuthView {
  if (search.mode !== 'signup' || search.confirmed || search.confirmationError) return 'login';
  return search.as === 'hiring' ? 'hiring' : search.as === 'seeker' ? 'seeker' : 'choose';
}
