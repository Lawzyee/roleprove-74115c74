import { describe, expect, it } from 'vitest';
import { validatePublicReport, PUBLIC_REPORTS_PER_HOUR } from './portfolio';
import { shareLinks } from '@/components/portfolio/ShareTools';

describe('signed-out portfolio reports', () => {
  it('allows 5 reports per hour per address', () => expect(PUBLIC_REPORTS_PER_HOUR).toBe(5));
  it('accepts a reason with no details or email', () => {
    const r = validatePublicReport({ slug: 'jane-doe', reason: 'offensive' });
    expect(r).toEqual({ ok: true, spam: false, value: { slug: 'jane-doe', reason: 'offensive', details: null, email: null } });
  });
  it('rejects an unknown reason', () => expect(validatePublicReport({ slug: 'jane', reason: 'hack' }).ok).toBe(false));
  it('requires details for "other"', () => expect(validatePublicReport({ slug: 'jane', reason: 'other', details: 'bad' }).ok).toBe(false));
  it('rejects an invalid email but allows blank', () => {
    expect(validatePublicReport({ slug: 'jane', reason: 'spam', email: 'not-an-email' }).ok).toBe(false);
    expect(validatePublicReport({ slug: 'jane', reason: 'spam', email: '' }).ok).toBe(true);
  });
  it('rejects a malformed slug', () => expect(validatePublicReport({ slug: '../x', reason: 'spam' }).ok).toBe(false));
  it('flags a filled honeypot as spam', () => {
    const r = validatePublicReport({ slug: 'jane', reason: 'spam', website: 'http://bot' });
    expect(r.ok && r.spam).toBe(true);
  });
});

describe('share links', () => {
  it('encode the portfolio URL', () => {
    const l = shareLinks('https://roleprove.com/p/jane', 'Jane');
    expect(l.linkedin).toContain(encodeURIComponent('https://roleprove.com/p/jane'));
    expect(l.whatsapp.startsWith('https://wa.me/?text=')).toBe(true);
    expect(l.email.startsWith('mailto:?subject=')).toBe(true);
  });
});

import { reportRetentionCutoffs } from './portfolio';
describe('visitor report retention', () => {
  it('resolved reports go after 90 days, unresolved after 12 months', () => {
    const c = reportRetentionCutoffs(new Date('2026-12-31T00:00:00Z'), 90, 365);
    expect(c.resolvedBefore).toBe('2026-10-02T00:00:00.000Z');
    expect(c.openBefore).toBe('2025-12-31T00:00:00.000Z');
  });
});
