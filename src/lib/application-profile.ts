// Application profile: what a candidate is willing to share when they apply (browser-safe rules).
//
// RULES FOR LATER EMPLOYER FEATURES (do not relax):
// - Employers see shared snapshots in the app only. No bulk export, no CSV/zip, no file downloads
//   other than the one CV the candidate chose to include in that snapshot.
// - Only items in SHAREABLE_ITEMS can ever be shared, and only when ticked.
// - Never shareable: phone, home address, date of birth, payment/billing data, support tickets,
//   interview transcripts, interview prep, recordings, uploaded work files, dispute history.
// - Consent is per application (one consent row per snapshot), never blanket.
// - Scores come from stored server results only; the candidate cannot type or edit them.
import { cleanText, displayUrl } from './portfolio';

export const CONSENT_WORDING_VERSION = '2026-11-25';
export const PHOTO_NOTE = 'Photos can lead to unfair decisions. Add one only if you want to.';
export const SCORE_WORDING = 'Practice-based indicator from RoleProve job simulations, not a guarantee of job performance.';
export const SHARE_EXPLAINER = [
  'Nothing is shared yet. Later, when you apply to a job through RoleProve, only the employer for that job will see what you tick here, and only after you review and confirm it for that application.',
  'The employer decides who to hire, not RoleProve.',
  'Scores are practice-based indicators, not a guarantee of job performance.',
  'You can withdraw what you shared at any time, which removes the employer\u2019s access.',
];

/** The allow-list: the only item keys that can ever appear in a share. */
export const SHAREABLE_ITEMS = ['name', 'headline', 'bio', 'target_score', 'pillars', 'projects', 'credentials', 'cv', 'links', 'location', 'work', 'photo', 'email'] as const;
export type ShareItem = (typeof SHAREABLE_ITEMS)[number];

export type ProfileSettings = {
  display_name: string | null; headline: string | null; bio: string | null;
  include_headline: boolean; include_bio: boolean; include_target_score: boolean; include_pillars: boolean;
  project_attempt_ids: string[]; credential_ids: string[]; cv_session_id: string | null;
  include_links: boolean; linkedin_url: string | null; github_url: string | null; other_url: string | null;
  include_location: boolean; city: string | null; country: string | null;
  include_work: boolean; work_arrangement: string | null; availability: string | null;
  include_photo: boolean; contact_mode: 'inbox' | 'email';
};
/** Minimum by default: name, headline and target role score. Photo off, inbox-only contact. */
export const DEFAULT_SETTINGS: ProfileSettings = {
  display_name: null, headline: null, bio: null,
  include_headline: true, include_bio: false, include_target_score: true, include_pillars: false,
  project_attempt_ids: [], credential_ids: [], cv_session_id: null,
  include_links: false, linkedin_url: null, github_url: null, other_url: null,
  include_location: false, city: null, country: null,
  include_work: false, work_arrangement: null, availability: null,
  include_photo: false, contact_mode: 'inbox',
};

/** Server-loaded facts. Scores and badges come from stored results, never from the candidate. */
export type ShareSources = {
  fallbackName: string; email: string | null; photoRef: string | null;
  target: { roleName: string; score: number; basis: 'verified' | 'generic' } | null;
  projects: Array<{ attemptId: string; title: string; role: string; date: string | null; score: number | null; verified: boolean; pillars: Array<{ label: string; score: number }> }>;
  credentials: Array<{ id: string; title: string; issuer: string; year: number | null; status: string; type: string; url: string | null }>;
  cvs: Array<{ sessionId: string; fileName: string; filePath: string; createdAt: string }>;
};

export type ShareView = {
  name: string;
  headline?: string; bio?: string;
  target?: { roleName: string; score: number; basis: 'verified' | 'generic'; wording: string };
  projects?: Array<{ attemptId: string; title: string; role: string; date: string | null; verified: boolean; score?: number; pillars?: Array<{ label: string; score: number }> }>;
  credentials?: ShareSources['credentials'];
  cv?: { sessionId: string; fileName: string; filePath: string };
  links?: Array<{ label: string; url: string }>;
  location?: string; work?: { arrangement?: string; availability?: string };
  photoRef?: string;
  contact: { mode: 'inbox' } | { mode: 'email'; email: string };
};

/** Builds exactly what an employer would see. Anything not ticked is left out entirely. */
export function buildShareView(s: ProfileSettings, src: ShareSources): { view: ShareView; items: ShareItem[] } {
  const items: ShareItem[] = ['name'];
  const view: ShareView = { name: cleanText(s.display_name || src.fallbackName || 'RoleProve candidate', 80), contact: { mode: 'inbox' } };
  const headline = cleanText(s.headline, 160);
  if (s.include_headline && headline) { view.headline = headline; items.push('headline'); }
  const bio = cleanText(s.bio, 500);
  if (s.include_bio && bio) { view.bio = bio; items.push('bio'); }
  if (s.include_target_score && src.target) { view.target = { ...src.target, wording: SCORE_WORDING }; items.push('target_score'); }
  const showScores = s.include_target_score;
  const picked = new Set(s.project_attempt_ids);
  const projects = src.projects.filter((p) => picked.has(p.attemptId)).map((p) => ({
    attemptId: p.attemptId, title: p.title, role: p.role, date: p.date, verified: p.verified,
    ...(showScores && p.score != null ? { score: p.score } : {}),
    ...(showScores && s.include_pillars ? { pillars: p.pillars } : {}),
  }));
  if (projects.length) { view.projects = projects; items.push('projects'); if (showScores && s.include_pillars) items.push('pillars'); }
  const creds = new Set(s.credential_ids);
  const credentials = src.credentials.filter((c) => creds.has(c.id)).map((c) => ({ ...c, url: displayUrl(c.url) }));
  if (credentials.length) { view.credentials = credentials; items.push('credentials'); }
  const cv = s.cv_session_id ? src.cvs.find((c) => c.sessionId === s.cv_session_id) : undefined;
  if (cv) { view.cv = { sessionId: cv.sessionId, fileName: cv.fileName, filePath: cv.filePath }; items.push('cv'); }
  if (s.include_links) {
    const links = ([['LinkedIn', s.linkedin_url], ['GitHub', s.github_url], ['Website', s.other_url]] as const)
      .flatMap(([label, u]) => { const url = displayUrl(u); return url ? [{ label, url }] : []; });
    if (links.length) { view.links = links; items.push('links'); }
  }
  if (s.include_location) {
    const loc = [cleanText(s.city, 80), cleanText(s.country, 80)].filter(Boolean).join(', ');
    if (loc) { view.location = loc; items.push('location'); }
  }
  if (s.include_work) {
    const arrangement = cleanText(s.work_arrangement, 120), availability = cleanText(s.availability, 120);
    if (arrangement || availability) { view.work = { ...(arrangement ? { arrangement } : {}), ...(availability ? { availability } : {}) }; items.push('work'); }
  }
  if (s.include_photo && src.photoRef) { view.photoRef = src.photoRef; items.push('photo'); }
  if (s.contact_mode === 'email' && src.email) { view.contact = { mode: 'email', email: src.email }; items.push('email'); }
  return { view, items };
}

/** Deep-frozen copy: a snapshot can't be altered in memory either. */
export function freezeSnapshot<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const deep = (o: unknown) => { if (o && typeof o === 'object') { Object.values(o).forEach(deep); Object.freeze(o); } };
  deep(copy);
  return copy;
}
