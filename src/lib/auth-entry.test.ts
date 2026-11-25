import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homeFor, initialView, landingTarget, parseAuthSearch, PLACEHOLDERS, PUBLIC_ROUTE_FILES } from './auth-entry';
import { employerSignUpSchema } from './employer-accounts';

const read = (p: string) => readFileSync(p, 'utf8');
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : []; });
}

describe('first screen redirects', () => {
  it('signed-out visitor to / sees the sign-in screen', () => {
    expect(landingTarget(false, null)).toBeNull();
  });
  it('signed-in candidate goes to /dashboard', () => {
    expect(landingTarget(true, 'candidate')).toBe('/dashboard');
    expect(homeFor('candidate')).toBe('/dashboard');
  });
  it('signed-in employer goes to /employer', () => {
    expect(landingTarget(true, 'employer')).toBe('/employer');
    expect(homeFor('employer')).toBe('/employer');
  });
  it('/ renders the sign-in panel and the panel routes by account type', () => {
    expect(read('src/routes/index.tsx')).toMatch(/<AuthPanel/);
    const panel = read('src/components/auth/AuthPanel.tsx');
    expect(panel).toMatch(/navigate\(\{ to: homeFor\(kind\)/);
  });
  it('signed-out visitor to a signed-in page is sent to sign in', () => {
    expect(read('src/routes/_authenticated/route.tsx')).toMatch(/redirect\(\{ to: "\/auth" \}\)/);
  });
  it('public pages stay outside the signed-in area', () => {
    for (const f of PUBLIC_ROUTE_FILES) expect(existsSync(join('src/routes', f)), f).toBe(true);
    expect(existsSync('src/routes/_authenticated/index.tsx')).toBe(false);
  });
  it('the old employer sign-up address opens the hiring form', () => {
    expect(read('src/routes/employers_.sign-up.tsx')).toMatch(/to: '\/auth', search: \{ mode: 'signup', as: 'hiring' \}/);
    expect(read('src/routes/employers.tsx')).toMatch(/search=\{\{ mode: "signup", as: "hiring" \}\}>Create an employer account/);
  });
});

describe('create account choice step', () => {
  it('opens on sign-in by default and the choice step for sign-up', () => {
    expect(initialView(parseAuthSearch({}))).toBe('login');
    expect(initialView(parseAuthSearch({ mode: 'signup' }))).toBe('choose');
    expect(initialView(parseAuthSearch({ mode: 'signup', as: 'hiring' }))).toBe('hiring');
    expect(initialView(parseAuthSearch({ mode: 'signup', as: 'seeker' }))).toBe('seeker');
    expect(initialView(parseAuthSearch({ mode: 'signup', as: 'admin' }))).toBe('choose');
  });
  it('job seeker sign-up never sends an account type', () => {
    const panel = read('src/components/auth/AuthPanel.tsx');
    const seeker = panel.slice(panel.indexOf('const signUpSeeker'), panel.indexOf('const signUpHiring'));
    expect(seeker).not.toMatch(/account_type/);
    expect(seeker).toMatch(/terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION/);
  });
  it('hiring sign-up needs company name, job title optional, extra values dropped', () => {
    const base = { name: 'Jane Doe', email: 'jane.doe@acme.com', password: 'longenough', terms: true };
    expect(employerSignUpSchema.safeParse(base).success).toBe(false);
    const ok = employerSignUpSchema.parse({ ...base, company_name: 'Acme', account_type: 'staff', is_support_staff: true });
    expect(ok).not.toHaveProperty('account_type');
    expect(ok).not.toHaveProperty('is_support_staff');
    expect(ok.job_title).toBeUndefined();
  });
});

describe('placeholders', () => {
  it('uses the agreed neutral examples', () => {
    expect(PLACEHOLDERS.name).toBe('Jane Doe');
    expect(PLACEHOLDERS.email).toBe('jane.doe@example.com');
    expect(PLACEHOLDERS.workEmail).toBe('jane.doe@yourcompany.com');
  });
  it('every name box says Jane Doe', () => {
    const files = walk('src').filter((f) => !f.includes('integrations/') && !f.endsWith('auth-entry.test.ts'));
    for (const f of files) {
      const s = read(f);
      expect(s, f).not.toMatch(/Ada Okafor/);
      for (const m of s.matchAll(/<Input[^>]*autoComplete="name"[^>]*>/g)) expect(m[0], f).toMatch(/placeholder=\{PLACEHOLDERS\.name\}/);
    }
    expect(read('src/routes/_authenticated/profile.tsx')).toMatch(/\["name", "Full name", PLACEHOLDERS\.name\]/);
    expect(read('src/routes/employers.tsx')).toMatch(/text\('full_name', 'Full name', 'text', false, PLACEHOLDERS\.name\)/);
    expect(read('src/routes/employers_.submit.tsx')).toMatch(/text\('submitter_name', 'Your name', 'text', PLACEHOLDERS\.name\)/);
  });
  it('no email box suggests you@…', () => {
    for (const f of walk('src').filter((x) => !x.endsWith('auth-entry.test.ts'))) expect(read(f), f).not.toMatch(/placeholder="you@/);
  });
});

describe('age confirmation, password reset and share tags', () => {
  const panel = read('src/components/auth/AuthPanel.tsx');
  it('job seeker sign-up requires the 18+ tick and records it', () => {
    expect(panel).toMatch(/I am 18 or over and I agree/);
    expect(panel).toMatch(/if \(!f\.terms\) return setError/);
    expect(panel).toMatch(/age_confirmed: true/);
    expect(read('drizzle/migrations/0025_record_age_confirmation.sql')).toMatch(/age_confirmed/);
  });
  it('reset shows one message whether or not the account exists', () => {
    const forgot = panel.slice(panel.indexOf('const forgot'), panel.indexOf('async function resend'));
    expect(forgot).toMatch(/setResetSentTo\(email\)/);
    expect(forgot).not.toMatch(/not found|no account|isn't registered/i);
    expect(panel).toMatch(/If an account exists for/);
    expect(panel).toMatch(/RESET_COOLDOWN_MS = 60_000/);
  });
  it('reset link returns to the reset page and is rewritten to the site address', async () => {
    expect(panel).toMatch(/redirectTo: `\$\{window\.location\.origin\}\/reset-password`/);
    process.env['SITE_URL'] = 'https://roleprove.com';
    const { authActionLink } = await import('./site-url');
    const out = new URL(authActionLink('https://auth.example/verify?token=x&type=recovery&redirect_to=http://localhost:8080/reset-password'));
    expect(out.searchParams.get('redirect_to')).toMatch(/\/reset-password$/);
    expect(out.searchParams.get('redirect_to')).not.toMatch(/localhost/);
  });
  it('the sign-in screen has its own title, description and share tags', () => {
    const idx = read('src/routes/index.tsx');
    for (const t of ['{ title: TITLE }', 'name: "description", content: DESC', 'property: "og:title", content: TITLE', 'property: "og:description", content: DESC', 'property: "og:url", content: "https://roleprove.com/"', 'rel: "canonical", href: "https://roleprove.com/"']) expect(idx).toContain(t);
    expect(idx).not.toMatch(/Lovable App/);
  });
});
