// Server-only: loads share sources from stored results, freezes snapshots, records consent, withdraws.
// Employers (later) view snapshots in the app only — no bulk export, no file downloads except the chosen CV.
import type { SupabaseClient } from '@supabase/supabase-js';
import { roleBestScore } from './simulations';
import { ROLE_REGISTRY, roleKeyForId } from './role-registry';
import { PILLARS, PILLAR_LABELS } from './scoring-config';
import { CONSENT_WORDING_VERSION, DEFAULT_SETTINGS, buildShareView, type ProfileSettings, type ShareSources, type ShareView, type ShareItem } from './application-profile';

type Admin = SupabaseClient;
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as Array<keyof ProfileSettings>;

export async function loadSettings(admin: Admin, userId: string): Promise<ProfileSettings> {
  const { data, error } = await admin.from('application_profiles').select(SETTING_KEYS.join(', ')).eq('user_id', userId).maybeSingle();
  if (error) throw new Error('Could not load your application profile.');
  return { ...DEFAULT_SETTINGS, ...((data as Partial<ProfileSettings> | null) ?? {}) };
}

function pillarList(raw: unknown) {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, { score?: number | null } | number | null>;
  return PILLARS.flatMap((k) => {
    const v = p[k]; const n = typeof v === 'number' ? v : v && typeof v === 'object' ? v.score : null;
    return typeof n === 'number' ? [{ label: PILLAR_LABELS[k], score: Math.round(n) }] : [];
  });
}

export async function loadSources(admin: Admin, userId: string): Promise<ShareSources> {
  const [prof, atts, creds, cvs, port, roles, auth] = await Promise.all([
    admin.from('profiles').select('name, email, target_role_id').eq('id', userId).maybeSingle(),
    admin.from('simulation_attempts').select('id, status, overall_score, pillar_scores, simulation_type, proctoring_mode, completed_at, simulations(title, role_id)').eq('user_id', userId).eq('status', 'completed').not('overall_score', 'is', null).order('completed_at', { ascending: false }).limit(200),
    admin.from('credentials').select('id, title, issuer, year, status, credential_type, verification_url').eq('user_id', userId).order('year', { ascending: false }),
    admin.from('interview_prep_sessions').select('id, cv_file_path, created_at').eq('user_id', userId).not('cv_file_path', 'is', null).order('created_at', { ascending: false }),
    admin.from('portfolios').select('photo_path').eq('user_id', userId).maybeSingle(),
    admin.from('roles').select('id, name'),
    admin.auth.admin.getUserById(userId),
  ]);
  for (const r of [prof, atts, creds, cvs, port, roles]) if (r.error) throw new Error('Could not load your profile details.');
  const names = new Map((roles.data ?? []).map((r) => [r.id, r.name]));
  const roleName = (id: string | null | undefined) => { const k = roleKeyForId(id); return k ? ROLE_REGISTRY[k].name : (id && names.get(id)) || 'Job simulation'; };
  const attempts = (atts.data ?? []) as unknown as Array<{ id: string; status: string; overall_score: number | null; pillar_scores: unknown; simulation_type: string; proctoring_mode: string | null; completed_at: string | null; simulations: { title: string; role_id: string } | null }>;
  const targetId = prof.data?.target_role_id ?? null;
  const best = targetId ? roleBestScore(attempts as never, targetId) : null;
  return {
    fallbackName: prof.data?.name ?? 'RoleProve candidate',
    email: auth.data.user?.email ?? prof.data?.email ?? null,
    photoRef: port.data?.photo_path ?? null,
    target: best && best.score != null && best.basis ? { roleName: roleName(targetId), score: best.score, basis: best.basis } : null,
    projects: attempts.map((a) => ({ attemptId: a.id, title: a.simulations?.title ?? 'Simulation', role: roleName(a.simulations?.role_id), date: a.completed_at, score: a.overall_score, verified: a.proctoring_mode === 'verified', pillars: pillarList(a.pillar_scores) })),
    credentials: (creds.data ?? []).map((c) => ({ id: c.id, title: c.title, issuer: c.issuer, year: c.year, status: c.status, type: c.credential_type, url: c.verification_url })),
    cvs: (cvs.data ?? []).map((c) => ({ sessionId: c.id, filePath: c.cv_file_path as string, fileName: (c.cv_file_path as string).split('/').pop()!.replace(/^\d+-/, ''), createdAt: c.created_at })),
  };
}

/** What an employer would see right now (used by "Preview as an employer" and by snapshots). */
export async function currentShare(admin: Admin, userId: string) {
  const [settings, sources] = await Promise.all([loadSettings(admin, userId), loadSources(admin, userId)]);
  return { settings, sources, ...buildShareView(settings, sources) };
}

/**
 * Freezes the current share into an immutable snapshot plus a per-application consent record.
 * The database trigger blocks any later change to content or items. Pass replacesSnapshotId to send an updated version.
 */
export async function createSnapshot(admin: Admin, userId: string, opts: { employerRef?: string | null; jobId?: string | null; replacesSnapshotId?: string | null } = {}) {
  const { view, items } = await currentShare(admin, userId);
  if (opts.replacesSnapshotId) {
    const { data: prev } = await admin.from('application_snapshots').select('id').eq('id', opts.replacesSnapshotId).eq('user_id', userId).maybeSingle();
    if (!prev) throw new Error('Snapshot not found.');
  }
  const { data: snap, error } = await admin.from('application_snapshots').insert({ user_id: userId, content: view as never, included_items: items, replaces_snapshot_id: opts.replacesSnapshotId ?? null }).select('id, content, included_items, created_at').single();
  if (error || !snap) throw new Error('Could not save the snapshot.');
  const { data: consent, error: cErr } = await admin.from('application_consents').insert({ user_id: userId, snapshot_id: snap.id, included_items: items, wording_version: CONSENT_WORDING_VERSION, employer_ref: opts.employerRef ?? null, job_id: opts.jobId ?? null }).select('id').single();
  if (cErr || !consent) { await admin.from('application_snapshots').delete().eq('id', snap.id); throw new Error('Could not record consent.'); }
  if (opts.replacesSnapshotId) await withdrawSnapshot(admin, userId, opts.replacesSnapshotId);
  return { snapshotId: snap.id, consentId: consent.id, content: snap.content as ShareView, items: snap.included_items as ShareItem[] };
}

/** Withdraws a snapshot and its consent. Later employer reads must use readSnapshotForEmployer, which then returns null. */
export async function withdrawSnapshot(admin: Admin, userId: string, snapshotId: string) {
  const now = new Date().toISOString();
  const { data, error } = await admin.from('application_snapshots').update({ withdrawn_at: now }).eq('id', snapshotId).eq('user_id', userId).is('withdrawn_at', null).select('id');
  if (error) throw new Error('Could not withdraw.');
  const { error: cErr } = await admin.from('application_consents').update({ withdrawn_at: now }).eq('snapshot_id', snapshotId).eq('user_id', userId).is('withdrawn_at', null);
  if (cErr) throw new Error('Could not withdraw consent.');
  return { withdrawn: (data ?? []).length > 0 };
}

/** The single read path future employer screens must use: withdrawn snapshots return null. */
export async function readSnapshotForEmployer(admin: Admin, snapshotId: string): Promise<ShareView | null> {
  const { data, error } = await admin.from('application_snapshots').select('content, withdrawn_at').eq('id', snapshotId).maybeSingle();
  if (error) throw new Error('Could not load.');
  if (!data || data.withdrawn_at) return null;
  return data.content as ShareView;
}
