import { requireCandidate } from './candidate-middleware';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { settingsInputSchema } from './application-profile';

const admin = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin;

export const getApplicationProfileFn = createServerFn({ method: 'POST' }).middleware([requireCandidate])
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

export const saveApplicationProfileFn = createServerFn({ method: 'POST' }).middleware([requireCandidate])
  .inputValidator((d: unknown) => settingsInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const { loadSources, sanitizeSettings } = await import('./application-profile.server');
    let clean;
    try { clean = sanitizeSettings(data, await loadSources(a, context.userId)); } catch (e) { return { error: (e as Error).message }; }
    const { error } = await a.from('application_profiles').upsert({ user_id: context.userId, ...clean, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) return { error: 'Could not save your application profile.' };
    return { ok: true as const };
  });

export const withdrawSnapshotFn = createServerFn({ method: 'POST' }).middleware([requireCandidate])
  .inputValidator((d: unknown) => z.object({ snapshotId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { withdrawSnapshot } = await import('./application-profile.server');
    try { return { ok: true as const, ...(await withdrawSnapshot(await admin(), context.userId, data.snapshotId)) }; }
    catch (e) { return { error: (e as Error).message }; }
  });
