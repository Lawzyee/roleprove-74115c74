import { describe, expect, it } from 'vitest';
import { cleanText, ctaCopy, displayUrl, safeUrl, slugProblem, stageReplies, stageTables, stageVisibility } from './portfolio';
import { sniffImage, stripImageMetadata } from './image-meta';

describe('slug rules', () => {
  it('accepts 3-30 lowercase letters, numbers and hyphens', () => {
    expect(slugProblem('jane-doe-2')).toBeNull();
    expect(slugProblem('abc')).toBeNull();
    expect(slugProblem('a'.repeat(30))).toBeNull();
  });
  it('rejects too short, too long, uppercase, symbols and edge hyphens', () => {
    expect(slugProblem('ab')).toMatch(/3 to 30/);
    expect(slugProblem('a'.repeat(31))).toMatch(/3 to 30/);
    expect(slugProblem('Jane')).toMatch(/lowercase/);
    expect(slugProblem('jane_doe')).toMatch(/lowercase/);
    expect(slugProblem('-jane')).toMatch(/hyphen/);
  });
  it('rejects reserved words and offensive words, including digit swaps', () => {
    expect(slugProblem('admin')).toMatch(/reserved/);
    expect(slugProblem('support')).toMatch(/reserved/);
    expect(slugProblem('sh1t-head')).toMatch(/allowed/);
  });
});

describe('text and links', () => {
  it('keeps <script> as plain text (rendered as text, never HTML)', () => {
    expect(cleanText('<script>alert(1)</script>', 500)).toBe('<script>alert(1)</script>');
    expect(cleanText('x'.repeat(600), 500)).toHaveLength(500);
  });
  it('only allows http and https links', () => {
    expect(safeUrl('https://linkedin.com/in/jane')).toBe('https://linkedin.com/in/jane');
    expect(() => safeUrl('javascript:alert(1)')).toThrow(/https/);
    expect(() => safeUrl('data:text/html,hi')).toThrow(/https/);
    expect(displayUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('')).toBeNull();
  });
});

describe('stage visibility', () => {
  it('defaults: summary on, replies on, raw datasets off', () => {
    expect(stageVisibility({}, 't1')).toEqual({ summary: true, replies: true, data: false });
    expect(stageVisibility({ t1: { replies: false } }, 't1')).toEqual({ summary: true, replies: false, data: false });
  });
  it('shows question labels and the user reply, never answer keys', () => {
    const rubric = { fields: [{ key: 'dup', label: 'How many duplicates?', answer: 2 }] };
    const out = stageReplies(rubric, { dup: '3' });
    expect(out).toEqual([{ label: 'How many duplicates?', reply: '3' }]);
    expect(JSON.stringify(out)).not.toContain('answer');
  });
  it('collects datasets from tables/datasets/dataset', () => {
    expect(stageTables({ dataset: { name: 'x', rows: [{ a: 1 }] } })).toEqual([{ name: 'x', rows: [{ a: '1' }] }]);
  });
});

describe('sign-up prompt copy', () => {
  const now = Date.parse('2026-11-15T00:00:00Z');
  it('paywall off with launch date ahead: free during launch', () => {
    expect(ctaCopy({ enforced: false, launchFreeUntil: '2026-12-31', trialDays: 21 }, now).note).toBe('Free during launch.');
  });
  it('paywall off without a launch date: no free claim', () => {
    expect(ctaCopy({ enforced: false, launchFreeUntil: null, trialDays: 21 }, now).note).toBeNull();
  });
  it('paywall on: Start your free trial', () => {
    expect(ctaCopy({ enforced: true, launchFreeUntil: null, trialDays: 21 }, now).button).toBe('Start your free trial');
  });
});

describe('photo metadata stripping', () => {
  it('detects real type and removes EXIF from a JPEG', () => {
    const exif = [0xff, 0xe1, 0x00, 0x0a, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x47, 0x50]; // APP1 "Exif..GP"
    const app0 = [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46];
    const sos = [0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9];
    const jpg = new Uint8Array([0xff, 0xd8, ...app0, ...exif, ...sos]);
    expect(sniffImage(jpg)).toBe('image/jpeg');
    const out = stripImageMetadata(jpg, 'image/jpeg');
    expect(Array.from(out)).toEqual([0xff, 0xd8, ...app0, ...sos]);
  });
  it('rejects a file whose bytes are not an image even if named .jpg', () => {
    expect(sniffImage(new TextEncoder().encode('<html>not an image</html>'))).toBeNull();
  });
});
