/**
 * The ONLY place that builds absolute links (emails, share/OG URLs, checkout returns).
 * The base comes from configuration, never from the request URL or headers.
 * - Published (production) build: SITE_URL setting, default https://roleprove.com. A localhost,
 *   loopback or preview address is refused and replaced by the canonical address.
 * - Non-production (preview/dev/tests): PREVIEW_SITE_URL setting, else the project's preview address.
 */
export const CANONICAL_SITE_URL = 'https://roleprove.com';
export const DEFAULT_PREVIEW_SITE_URL = 'https://id-preview--29bf06f6-108c-4caf-b213-ffea4035830e.lovable.app';

const FORBIDDEN_IN_PRODUCTION = /(^|\.)localhost$|^127\.|^0\.0\.0\.0$|^\[?::1\]?$|^id-preview--|^preview--|\.lovableproject\.com$/i;

export function isForbiddenProductionHost(hostname: string) {
  return FORBIDDEN_IN_PRODUCTION.test(hostname);
}

export type SiteUrlConfig = { production: boolean; siteUrl?: string | undefined; previewUrl?: string | undefined };

function clean(value: string | undefined): URL | null {
  if (!value) return null;
  try { const u = new URL(value.trim()); return u.protocol === 'https:' || u.protocol === 'http:' ? u : null; } catch { return null; }
}

/** Pure resolver, exported for tests. */
export function resolveSiteUrl(cfg: SiteUrlConfig): string {
  if (cfg.production) {
    const u = clean(cfg.siteUrl);
    if (!u || u.protocol !== 'https:' || isForbiddenProductionHost(u.hostname)) return CANONICAL_SITE_URL;
    return u.origin;
  }
  return (clean(cfg.previewUrl) ?? clean(cfg.siteUrl) ?? new URL(DEFAULT_PREVIEW_SITE_URL)).origin;
}

function env(name: string): string | undefined {
  return typeof process !== 'undefined' ? process.env[name] : undefined;
}

export function currentSiteUrlConfig(): SiteUrlConfig {
  return { production: import.meta.env.PROD === true || env('SITE_URL_MODE') === 'production', siteUrl: env('SITE_URL'), previewUrl: env('PREVIEW_SITE_URL') };
}

export function siteUrl(): string {
  return resolveSiteUrl(currentSiteUrlConfig());
}

/** Builds an absolute link to an app path. Tokens and other query values go through `query`, never string-concatenated. */
export function absoluteUrl(path: string, query?: Record<string, string | undefined>): string {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('absoluteUrl needs an app path starting with "/".');
  const u = new URL(path, siteUrl() + '/');
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

/** Auth action links come from the sign-in service; their return address is rewritten to the configured site. */
export function authActionLink(url: string): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  const back = u.searchParams.get('redirect_to');
  if (back !== null) {
    let path = '/auth/confirm';
    try { const b = new URL(back); if (b.pathname.startsWith('/') && !b.pathname.startsWith('//')) path = b.pathname + b.search; } catch { /* keep default */ }
    const target = new URL(path, siteUrl() + '/');
    u.searchParams.set('redirect_to', target.toString());
  }
  return u.toString();
}
