import { describe, expect, it } from 'vitest';
import { buildShareView, DEFAULT_SETTINGS, freezeSnapshot, SHAREABLE_ITEMS, type ShareSources } from './application-profile';

const src: ShareSources = {
  fallbackName: 'Ada Test', email: 'ada@example.com', photoRef: 'u/photo.jpg',
  target: { roleName: 'Data Analyst', score: 72, basis: 'verified' },
  projects: [
    { attemptId: 'a1', title: 'Churn case', role: 'Data Analyst', date: null, score: 72, verified: true, pillars: [{ label: 'Framing', score: 80 }] },
    { attemptId: 'a2', title: 'Second case', role: 'Data Analyst', date: null, score: 50, verified: false, pillars: [] },
  ],
  credentials: [{ id: 'c1', title: 'SQL cert', issuer: 'X', year: 2025, status: 'verified', type: 'certificate', url: 'javascript:alert(1)' }, { id: 'c2', title: 'Other', issuer: 'Y', year: null, status: 'self_reported', type: 'certificate', url: null }],
  cvs: [{ sessionId: 's1', fileName: 'cv.pdf', filePath: 'u/interview-prep-cv/1-cv.pdf', createdAt: '' }],
};
const base = { ...DEFAULT_SETTINGS, headline: 'Analyst', bio: 'Secret bio', city: 'Lagos', country: 'Nigeria', linkedin_url: 'https://linkedin.com/in/x', work_arrangement: 'Remote' };

describe('application share view', () => {
  it('defaults share only name, headline and target role score', () => {
    const { view, items } = buildShareView(base, src);
    expect(items).toEqual(['name', 'headline', 'target_score']);
    expect(Object.keys(view).sort()).toEqual(['contact', 'headline', 'name', 'target']);
    expect(view.contact).toEqual({ mode: 'inbox' });
    expect(JSON.stringify(view)).not.toContain('Secret bio');
    expect(JSON.stringify(view)).not.toContain('ada@example.com');
    expect(JSON.stringify(view)).not.toContain('photo');
  });
  it('photo is off and contact is inbox-only by default', () => {
    expect(DEFAULT_SETTINGS.include_photo).toBe(false);
    expect(DEFAULT_SETTINGS.contact_mode).toBe('inbox');
  });
  it('ticking one project, one credential and a CV shares exactly those', () => {
    const { view, items } = buildShareView({ ...base, project_attempt_ids: ['a1'], credential_ids: ['c1'], cv_session_id: 's1' }, src);
    expect(view.projects?.map((p) => p.attemptId)).toEqual(['a1']);
    expect(view.projects?.[0]).not.toHaveProperty('pillars');
    expect(view.credentials?.map((c) => c.id)).toEqual(['c1']);
    expect(view.credentials?.[0]?.url).toBeNull(); // non-http link dropped
    expect(view.cv?.fileName).toBe('cv.pdf');
    expect(items).toEqual(['name', 'headline', 'target_score', 'projects', 'credentials', 'cv']);
    expect(JSON.stringify(view)).not.toContain('Second case');
  });
  it('pillar bars and project scores need the score toggle', () => {
    const off = buildShareView({ ...base, include_target_score: false, include_pillars: true, project_attempt_ids: ['a1'] }, src).view;
    expect(off.target).toBeUndefined();
    expect(off.projects?.[0]).not.toHaveProperty('score');
    expect(off.projects?.[0]).not.toHaveProperty('pillars');
    const on = buildShareView({ ...base, include_pillars: true, project_attempt_ids: ['a1'] }, src).view;
    expect(on.projects?.[0]?.pillars).toEqual([{ label: 'Framing', score: 80 }]);
  });
  it('only allow-listed item keys can ever appear', () => {
    const all = buildShareView({ ...base, include_bio: true, include_links: true, include_location: true, include_work: true, include_photo: true, include_pillars: true, contact_mode: 'email', project_attempt_ids: ['a1', 'a2'], credential_ids: ['c1', 'c2'], cv_session_id: 's1' }, src);
    for (const i of all.items) expect(SHAREABLE_ITEMS).toContain(i);
    expect(all.view.contact).toEqual({ mode: 'email', email: 'ada@example.com' });
  });
  it('a frozen snapshot cannot be altered and ignores later profile edits', () => {
    const settings = { ...base };
    const snap = freezeSnapshot(buildShareView(settings, src).view);
    settings.headline = 'Changed later';
    expect(snap.headline).toBe('Analyst');
    expect(() => { (snap as { headline?: string }).headline = 'x'; }).toThrow();
    expect(() => { (snap.target as { score: number }).score = 100; }).toThrow();
  });
});
