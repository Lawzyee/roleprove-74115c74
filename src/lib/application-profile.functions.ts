import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { cleanText, safeUrl } from './portfolio';

const admin = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin;

export const getApplicationProfileFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { currentShare } = await import('./application-profile.server');
    const a = await admin();
    const s = await currentShare(a, context.userId);
    let photo: string | null = null;
    if (s.view.photoRef) photo = (await a.storage.from('portfolio-photos').createSignedUrl(s.view.photoRef, 600)).data?.signedUrl ?? null;
    const { data: snaps } = await context.supabase.from('application_snapshots').select('id, included_items, created_at, withdrawn_at').order('created_at', { ascending: false }).limit(50);
    // File paths stay on the server.
    const cvs = s.sources.cvs.map(({ sessionId, fileName, createdAt }) => ({ sessionId, fileName, createdAt }));
    const view = { ...s.view, ...(s.view.cv ? { cv: { ...s.view.cv, filePath: '' } } : {}), photoRef: undefined };
    const [{ data: pf }, { data: pr }] = await Promise.all([
      a.from('portfolios').select('bio, display_name, city, country').eq('user_id', context.userId).maybeSingle(),
      a.from('profiles').select('headline, linkedin_url, github_url, portfolio_url').eq('id', context.userId).maybeSingle(),
    ]);
    const { count } = await a.from('application_profiles').select('user_id', { count: 'exact', head: true }).eq('user_id', context.userId);
    const suggest = { display_name: pf?.display_name ?? null, headline: pr?.headline ?? null, bio: pf?.bio ?? null, city: pf?.city ?? null, country: pf?.country ?? null, linkedin_url: pr?.linkedin_url ?? null, github_url: pr?.github_url ?? null, other_url: pr?.portfolio_url ?? null };
    return { saved: (count ?? 0) > 0, suggest, settings: s.settings, sources: { ...s.sources, cvs, photoRef: s.sources.photoRef ? 'yes' : null }, preview: view, items: s.items, photo, snapshots: snaps ?? [] };
  });

const t = (n: number) => z.string().max(n * 2).nullable();
export const saveApplicationProfileFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    display_name: t(80), headline: t(160), bio: t(500),
    include_headline: z.boolean(), include_bio: z.boolean(), include_target_score: z.boolean(), include_pillars: z.boolean(),
    project_attempt_ids: z.array(z.string().uuid()).max(20), credential_ids: z.array(z.string().uuid()).max(50), cv_session_id: z.string().uuid().nullable(),
    include_links: z.boolean(), linkedin_url: t(300), github_url: t(300), other_url: t(300),
    include_location: z.boolean(), city: t(80), country: t(80),
    include_work: z.boolean(), work_arrangement: t(120), availability: t(120),
    include_photo: z.boolean(), contact_mode: z.enum(['inbox', 'email']),
  }).parse(d))
  .handler(async ({ data, context }) => {
    let links: Record<string, string | null>;
    try { links = { linkedin_url: safeUrl(data.linkedin_url), github_url: safeUrl(data.github_url), other_url: safeUrl(data.other_url) }; }
    catch (e) { return { error: (e as Error).message }; }
    const a = await admin();
    // Only the candidate's own completed, graded attempts, credentials and CVs can be picked.
    const { loadSources } = await import('./application-profile.server');
    const src = await loadSources(a, context.userId);
    const own = (ids: string[], valid: string[]) => ids.filter((id) => valid.includes(id));
    const cv = data.cv_session_id && src.cvs.some((c) => c.sessionId === data.cv_session_id) ? data.cv_session_id : null;
    const c = (v: string | null, n: number) => cleanText(v, n) || null;
    const { error } = await a.from('application_profiles').upsert({
      user_id: context.userId,
      display_name: c(data.display_name, 80), headline: c(data.headline, 160), bio: c(data.bio, 500),
      include_headline: data.include_headline, include_bio: data.include_bio, include_target_score: data.include_target_score, include_pillars: data.include_pillars,
      project_attempt_ids: own(data.project_attempt_ids, src.projects.map((p) => p.attemptId)),
      credential_ids: own(data.credential_ids, src.credentials.map((x) => x.id)), cv_session_id: cv,
      include_links: data.include_links, ...links,
      include_location: data.include_location, city: c(data.city, 80), country: c(data.country, 80),
      include_work: data.include_work, work_arrangement: c(data.work_arrangement, 120), availability: c(data.availability, 120),
      include_photo: data.include_photo, contact_mode: data.contact_mode, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) return { error: 'Could not save your application profile.' };
    return { ok: true as const };
  });

export const withdrawSnapshotFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ snapshotId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { withdrawSnapshot } = await import('./application-profile.server');
    try { return { ok: true as const, ...(await withdrawSnapshot(await admin(), context.userId, data.snapshotId)) }; }
    catch (e) { return { error: (e as Error).message }; }
  });
