import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { render } from '@react-email/render';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANONICAL_SITE_URL, resolveSiteUrl } from './site-url';

const BAD = /localhost|127\.0\.0\.1|id-preview--|preview--[\w-]+\.lovable\.app|lovableproject\.com|0\.0\.0\.0/i;

describe('resolveSiteUrl', () => {
  it('uses https://roleprove.com in production by default', () => {
    expect(resolveSiteUrl({ production: true })).toBe('https://roleprove.com');
  });
  it('refuses localhost, loopback and preview addresses in production', () => {
    for (const bad of ['http://localhost:8080', 'https://localhost', 'https://127.0.0.1:3000', 'https://id-preview--abc.lovable.app', 'https://abc.lovableproject.com', 'http://roleprove.com'])
      expect(resolveSiteUrl({ production: true, siteUrl: bad, previewUrl: 'https://id-preview--x.lovable.app' })).toBe(CANONICAL_SITE_URL);
  });
  it('honours a configured https site address in production and ignores the preview address', () => {
    expect(resolveSiteUrl({ production: true, siteUrl: 'https://www.roleprove.com/', previewUrl: 'https://id-preview--x.lovable.app' })).toBe('https://www.roleprove.com');
  });
  it('may use the preview address outside production', () => {
    expect(resolveSiteUrl({ production: false, previewUrl: 'https://id-preview--x.lovable.app' })).toBe('https://id-preview--x.lovable.app');
  });
});

describe('rendered emails in a production configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('PROD', true);
    vi.stubEnv('SITE_URL', 'http://localhost:8080'); // a wrong setting must still never leak
    vi.stubEnv('PREVIEW_SITE_URL', 'https://id-preview--29bf06f6-108c-4caf-b213-ffea4035830e.lovable.app');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('no app email contains localhost, 127.0.0.1 or a preview address', async () => {
    const { TEMPLATES } = await import('./email-templates/registry');
    const { absoluteUrl, siteUrl } = await import('./site-url');
    expect(Object.keys(TEMPLATES).length).toBeGreaterThanOrEqual(7);
    for (const [name, t] of Object.entries(TEMPLATES)) {
      for (const props of [t.previewData ?? {}, {}]) {
        const html = await render(React.createElement(t.component, props));
        expect(html, name).not.toMatch(BAD);
        for (const href of html.matchAll(/href="(https?:[^"]+)"/g)) expect(href[1]!.startsWith('https://roleprove.com/'), `${name}: ${href[1]}`).toBe(true);
      }
    }
    // Billing as sent by sendBillingEmail
    const billing = await render(React.createElement(TEMPLATES['billing-update']!.component, { kind: 'payment_failed', siteUrl: siteUrl() }));
    expect(billing).toContain('https://roleprove.com/settings');
    // Notification as sent by notify()
    const note = await render(React.createElement(TEMPLATES['new-notification']!.component, { url: absoluteUrl('/inbox') }));
    expect(note).toContain('https://roleprove.com/inbox');
  });

  it('auth emails point back to the configured site, never the request address', async () => {
    const { authActionLink, siteUrl } = await import('./site-url');
    const raw = 'https://auth.example.co/auth/v1/verify?token=abc&type=signup&redirect_to=http%3A%2F%2Flocalhost%3A8080%2Fauth%2Fconfirm';
    const link = authActionLink(raw);
    expect(new URL(link).searchParams.get('redirect_to')).toBe('https://roleprove.com/auth/confirm');
    const mods = await Promise.all(['signup', 'invite', 'magic-link', 'recovery', 'email-change'].map((n) => import(`./email-templates/${n}.tsx`)));
    for (const m of mods) {
      const C = Object.values(m).find((v) => typeof v === 'function') as React.ComponentType<any>;
      const html = await render(React.createElement(C, { siteName: 'RoleProve', siteUrl: siteUrl(), recipient: 'a@b.co', email: 'a@b.co', oldEmail: 'a@b.co', newEmail: 'c@d.co', confirmationUrl: link }));
      expect(html).not.toMatch(BAD);
    }
  });
});

describe('every link token is built by the shared function', () => {
  const root = join(process.cwd(), 'src');
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.ts$/.test(e.name) && !p.endsWith('site-url.ts') && !p.endsWith('routeTree.gen.ts')) files.push(p); } };
  walk(root);
  const emailFiles = files.filter((f) => /email-templates|lovable[\\/]email|employer|notifications\.server|billing\.server|payments\.functions|data-export|support\.|portfolio\.functions/.test(f));

  it('no hand-built token links anywhere in the app', () => {
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/[?&]token=\$\{/);
  });
  it('email and link code never derives an address from the request or hardcodes one', () => {
    for (const f of emailFiles) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/new URL\((req|request)\.url\)|x-forwarded-host|headers\.get\(['"]host['"]\)/);
      expect(src.replace(/(LOVABLE_SEND_URL|cloudflare-dns\.com)/g, ''), f).not.toMatch(/['"`]https?:\/\/(?!\$)/);
    }
  });
  it('employer, notification and auth senders use the shared function', () => {
    const uses = (f: string, fn: string) => expect(readFileSync(join(root, f), 'utf8')).toContain(fn);
    uses('lib/employer.functions.ts', "absoluteUrl('/employers/confirm', { token: confirm })");
    uses('lib/employer.functions.ts', "absoluteUrl('/employers/leave', { token: remove })");
    uses('lib/employer.functions.ts', "absoluteUrl('/employers/submit', { token })");
    uses('lib/employer.server.ts', "absoluteUrl('/employers/remove', { token })");
    uses('lib/notifications.server.ts', "absoluteUrl('/inbox')");
    uses('routes/lovable/email/auth/webhook.ts', 'authActionLink(data.url)');
  });
});
