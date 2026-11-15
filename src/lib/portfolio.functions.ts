import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { BIO_MAX, INSIGHT_MAX, MAX_INSIGHT_GENERATIONS, PHOTO_MAX_BYTES, cleanText, ctaCopy, safeUrl, slugProblem, validatePublicReport, PUBLIC_REPORTS_PER_HOUR } from './portfolio';
import {
  PHOTO_BUCKET, buildPublicPortfolio, groupFolders, loadOwnPortfolioRow, loadProject, loadPublicPortfolioRow, ownerName, rateOk, shapeProject, writeInsight,
  type OwnerStage, type PublicProject,
} from './portfolio.server';
import { sniffImage, stripImageMetadata } from './image-meta';

function origin() {
  const req = getRequest();
  const url = new URL(req.url);
  const sandboxHost = url.hostname === 'localhost' ? req.headers.get('x-forwarded-host') : null;
  return sandboxHost ? `https://${sandboxHost}` : url.origin;
}
const admin = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin;
async function ensurePortfolio(userId: string) {
  const a = await admin();
  const { error } = await a.from('portfolios').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (error) throw new Error('Could not set up your portfolio.');
  return a;
}
async function profileName(userId: string) {
  const { data } = await (await admin()).from('profiles').select('name').eq('id', userId).maybeSingle();
  return data?.name ?? null;
}
async function ctaSettings() {
  const { data } = await (await admin()).from('app_settings').select('paywall_enforced, launch_free_until, trial_days').eq('id', true).maybeSingle();
  return ctaCopy({ enforced: !!data?.paywall_enforced, launchFreeUntil: data?.launch_free_until ?? null, trialDays: data?.trial_days ?? 0 });
}

// ---------- Public (no sign-in). Private, unpublished and unknown slugs all return { found: false }. ----------
const slugInput = z.string().trim().toLowerCase().max(40);

export const getPublicPortfolioFn = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ slug: slugInput }).parse(d))
  .handler(async ({ data }) => {
    const a = await admin();
    if (!(await rateOk(a, data.slug))) return { found: false as const, limited: true };
    const row = await loadPublicPortfolioRow(a, data.slug);
    if (!row) return { found: false as const, limited: false };
    return { found: true as const, portfolio: await buildPublicPortfolio(a, row, origin()), cta: await ctaSettings() };
  });

export const getPublicProjectFn = createServerFn({ method: 'GET' })
  .inputValidator((d: unknown) => z.object({ slug: slugInput, projectId: z.string().max(40) }).parse(d))
  .handler(async ({ data }) => {
    const a = await admin();
    if (!(await rateOk(a, data.slug))) return { found: false as const, limited: true };
    const row = await loadPublicPortfolioRow(a, data.slug);
    if (!row || !z.string().uuid().safeParse(data.projectId).success) return { found: false as const, limited: false };
    const l = await loadProject(a, row.user_id, data.projectId);
    if (!l) return { found: false as const, limited: false };
    return { found: true as const, project: shapeProject(l, row, origin(), ownerName(await profileName(row.user_id), row), 'public'), cta: await ctaSettings() };
  });

// ---------- Owner ----------
export const getMyPortfolioFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await ensurePortfolio(context.userId);
    const { data: p, error } = await a.from('portfolios').select('*').eq('user_id', context.userId).single();
    if (error) throw new Error('Could not load your portfolio.');
    const { data: profile } = await a.from('profiles').select('name, headline, linkedin_url, github_url, portfolio_url').eq('id', context.userId).maybeSingle();
    const folders = await groupFolders(a, context.userId, p.show_scores);
    const { data: inPortfolio } = await a.from('portfolio_projects').select('attempt_id').eq('user_id', context.userId);
    const used = new Set((inPortfolio ?? []).map((r) => r.attempt_id));
    const { data: attempts } = await a.from('simulation_attempts').select('id, completed_at, overall_score, proctoring_mode, simulations(title)')
      .eq('user_id', context.userId).eq('status', 'completed').not('overall_score', 'is', null).order('completed_at', { ascending: false }).limit(100);
    let photo: string | null = null;
    if (p.photo_path) photo = (await a.storage.from(PHOTO_BUCKET).createSignedUrl(p.photo_path, 600)).data?.signedUrl ?? null;
    return {
      settings: p, profile, folders, photo,
      available: (attempts ?? []).filter((x) => !used.has(x.id)).map((x) => ({ id: x.id, title: (x.simulations as { title?: string } | null)?.title ?? 'Simulation', date: x.completed_at, score: x.overall_score, verified: x.proctoring_mode === 'verified' })),
    };
  });

const optText = (max: number) => z.string().max(max * 2).nullable().optional();
export const savePortfolioFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    display_name: optText(80), bio: optText(BIO_MAX), city: optText(80), country: optText(80), headline: optText(160),
    credly_url: optText(300), linkedin_url: optText(300), github_url: optText(300), portfolio_url: optText(300),
    show_linkedin: z.boolean(), show_github: z.boolean(), show_credly: z.boolean(), show_other: z.boolean(),
    show_scores: z.boolean(), show_credentials: z.boolean(), show_links: z.boolean(), show_location: z.boolean(), allow_indexing: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if ((data.bio ?? '').trim().length > BIO_MAX) return { error: `Your bio must be at most ${BIO_MAX} characters.` };
    let links: Record<string, string | null>;
    try {
      links = { credly_url: safeUrl(data.credly_url), linkedin_url: safeUrl(data.linkedin_url), github_url: safeUrl(data.github_url), portfolio_url: safeUrl(data.portfolio_url) };
    } catch (e) { return { error: (e as Error).message }; }
    const a = await ensurePortfolio(context.userId);
    const t = (v: string | null | undefined, n: number) => cleanText(v, n) || null;
    const { error } = await a.from('portfolios').update({
      display_name: t(data.display_name, 80), bio: t(data.bio, BIO_MAX), city: t(data.city, 80), country: t(data.country, 80), credly_url: links.credly_url,
      show_linkedin: data.show_linkedin, show_github: data.show_github, show_credly: data.show_credly, show_other: data.show_other,
      show_scores: data.show_scores, show_credentials: data.show_credentials, show_links: data.show_links, show_location: data.show_location,
      allow_indexing: data.allow_indexing, updated_at: new Date().toISOString(),
    }).eq('user_id', context.userId);
    if (error) return { error: 'Could not save your portfolio.' };
    const { error: pErr } = await a.from('profiles').update({ headline: t(data.headline, 160), linkedin_url: links.linkedin_url, github_url: links.github_url, portfolio_url: links.portfolio_url }).eq('id', context.userId);
    if (pErr) return { error: 'Could not save your links.' };
    return { ok: true };
  });

export const setSlugFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string().max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const slug = data.slug.trim();
    const problem = slugProblem(slug);
    if (problem) return { error: problem };
    const a = await ensurePortfolio(context.userId);
    const { error } = await a.from('portfolios').update({ slug, updated_at: new Date().toISOString() }).eq('user_id', context.userId);
    if (error) return { error: error.code === '23505' ? 'That link name is already taken. Please choose another.' : 'Could not save your link name.' };
    return { ok: true, slug };
  });

export const setVisibilityFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ isPublic: z.boolean(), consent: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await ensurePortfolio(context.userId);
    const { data: p } = await a.from('portfolios').select('slug, consented_at').eq('user_id', context.userId).single();
    const patch: Record<string, unknown> = { is_public: data.isPublic, updated_at: new Date().toISOString() };
    if (data.isPublic) {
      if (!p?.slug) return { error: 'Choose your link name first.' };
      if (!p.consented_at && !data.consent) return { error: 'Please confirm you understand who can see your portfolio.' };
      if (!p.consented_at) patch.consented_at = new Date().toISOString();
    }
    const { error } = await a.from('portfolios').update(patch as never).eq('user_id', context.userId);
    if (error) return { error: 'Could not change visibility.' };
    return { ok: true };
  });

export const uploadPhotoFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ base64: z.string().max(Math.ceil(PHOTO_MAX_BYTES * 1.4)) }).parse(d))
  .handler(async ({ data, context }) => {
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0)); } catch { return { error: 'Could not read that photo.' }; }
    if (bytes.length > PHOTO_MAX_BYTES) return { error: 'Photos must be 5 MB or smaller.' };
    const kind = sniffImage(bytes); // real type from the file bytes, not the name or browser label
    if (!kind) return { error: 'Please upload a JPG, PNG or WebP photo.' };
    let clean: Uint8Array;
    try { clean = stripImageMetadata(bytes, kind); } catch { return { error: 'That photo looks damaged. Please try another.' }; }
    const a = await ensurePortfolio(context.userId);
    const { data: p } = await a.from('portfolios').select('photo_path, photo_version').eq('user_id', context.userId).single();
    const version = (p?.photo_version ?? 0) + 1;
    const ext = kind === 'image/jpeg' ? 'jpg' : kind.split('/')[1];
    const path = `${context.userId}/photo-${crypto.randomUUID()}.${ext}`;
    const { error } = await a.storage.from(PHOTO_BUCKET).upload(path, clean, { contentType: kind, upsert: false });
    if (error) return { error: 'Could not save your photo.' };
    const { error: uErr } = await a.from('portfolios').update({ photo_path: path, photo_version: version }).eq('user_id', context.userId);
    if (uErr) { await a.storage.from(PHOTO_BUCKET).remove([path]); return { error: 'Could not save your photo.' }; }
    if (p?.photo_path) await a.storage.from(PHOTO_BUCKET).remove([p.photo_path]);
    return { ok: true };
  });

export const deletePhotoFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await admin();
    const { data: p } = await a.from('portfolios').select('photo_path, photo_version').eq('user_id', context.userId).maybeSingle();
    if (!p?.photo_path) return { ok: true };
    const { error } = await a.from('portfolios').update({ photo_path: null, photo_version: p.photo_version + 1 }).eq('user_id', context.userId);
    if (error) return { error: 'Could not remove your photo.' };
    const { error: sErr } = await a.storage.from(PHOTO_BUCKET).remove([p.photo_path]);
    if (sErr) return { error: 'Your photo is hidden but the file could not be removed. Please try again.' };
    return { ok: true };
  });

async function generateFor(userId: string, projectId: string) {
  const a = await admin();
  const l = await loadProject(a, userId, projectId);
  if (!l) throw new Error('Project not found.');
  if (l.project.insight_generations >= MAX_INSIGHT_GENERATIONS) throw new Error('You\u2019ve reached the limit for new insights on this project. You can still edit the text.');
  const { callAi } = await import('./interview-prep.server');
  const insight = await writeInsight(l, callAi);
  await a.from('portfolio_projects').update({ insight, insight_generations: l.project.insight_generations + 1, updated_at: new Date().toISOString() }).eq('id', projectId).eq('user_id', userId);
  return insight;
}

export const addProjectFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attemptId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await ensurePortfolio(context.userId);
    const { data: att } = await a.from('simulation_attempts').select('id, status, overall_score').eq('id', data.attemptId).eq('user_id', context.userId).maybeSingle();
    if (!att || att.status !== 'completed' || att.overall_score == null) return { error: 'Only completed, graded attempts can be added.' };
    const { data: row, error } = await a.from('portfolio_projects').insert({ user_id: context.userId, attempt_id: att.id }).select('id').single();
    if (error) return { error: error.code === '23505' ? 'This project is already in your portfolio.' : 'Could not add the project.' };
    let insightError: string | null = null;
    try { await generateFor(context.userId, row.id); } catch (e) { insightError = (e as Error).message; }
    return { ok: true, projectId: row.id, insightError };
  });

export const removeProjectFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Removes only the portfolio card; the attempt and its score are untouched.
    const { error } = await (await admin()).from('portfolio_projects').delete().eq('id', data.projectId).eq('user_id', context.userId);
    if (error) return { error: 'Could not remove the project.' };
    return { ok: true };
  });

export const getMyProjectFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const l = await loadProject(a, context.userId, data.projectId);
    if (!l) return { found: false as const };
    const row = await loadOwnPortfolioRow(a, context.userId);
    return { found: true as const, project: shapeProject(l, row, origin(), ownerName(await profileName(context.userId), row), 'owner') as PublicProject & { stages: OwnerStage[] }, generationsLeft: MAX_INSIGHT_GENERATIONS - l.project.insight_generations, showScores: !!row?.show_scores };
  });

const vis = z.object({ summary: z.boolean(), replies: z.boolean(), data: z.boolean() });
export const updateProjectFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), insight: z.string().max(INSIGHT_MAX * 2).optional(), stageSettings: z.record(z.string().uuid(), vis).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.insight !== undefined) {
      if (data.insight.trim().length > INSIGHT_MAX) return { error: `The insight must be at most ${INSIGHT_MAX} characters.` };
      patch.insight = cleanText(data.insight, INSIGHT_MAX) || null;
    }
    if (data.stageSettings) patch.stage_settings = data.stageSettings;
    const { error } = await (await admin()).from('portfolio_projects').update(patch as never).eq('id', data.projectId).eq('user_id', context.userId);
    if (error) return { error: 'Could not save the project.' };
    return { ok: true };
  });

export const regenerateInsightFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    try { return { ok: true, insight: await generateFor(context.userId, data.projectId) }; } catch (e) { return { error: (e as Error).message }; }
  });

/** Owner-only "preview as visitor": same public builder, ignoring the public switch. */
export const previewPortfolioFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await ensurePortfolio(context.userId);
    const row = await loadOwnPortfolioRow(a, context.userId);
    const p = await buildPublicPortfolio(a, row!, origin());
    let photo: string | null = null;
    if (row?.photo_path) photo = (await a.storage.from(PHOTO_BUCKET).createSignedUrl(row.photo_path, 600)).data?.signedUrl ?? null;
    return { portfolio: { ...p, photoUrl: photo } };
  });
export const previewProjectFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const row = await loadOwnPortfolioRow(a, context.userId);
    const l = row ? await loadProject(a, context.userId, data.projectId) : null;
    if (!row || !l) return { found: false as const };
    return { found: true as const, project: { ...shapeProject(l, row, origin(), ownerName(await profileName(context.userId), row), 'public'), photoUrl: null } };
  });

export const reportPortfolioFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: slugInput, reason: z.string().trim().min(10, 'Please describe the problem (at least 10 characters).').max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const a = await admin();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await a.from('support_tickets').select('id', { count: 'exact', head: true }).eq('user_id', context.userId).gte('created_at', since);
    if ((count ?? 0) >= 5) return { error: 'You\u2019ve sent several reports recently. Please try again later.' };
    const { data: ticket, error } = await a.from('support_tickets').insert({ user_id: context.userId, category: 'other', subject: `Portfolio report: ${data.slug}`, tags: ['portfolio_report'] }).select('id').single();
    if (error || !ticket) return { error: 'Could not send the report.' };
    const { error: mErr } = await a.from('support_messages').insert({ ticket_id: ticket.id, sender: 'user', body: `Reported portfolio: /p/${data.slug}\n\n${cleanText(data.reason, 1000)}` });
    if (mErr) return { error: 'Could not send the report.' };
    return { ok: true };
  });

// Signed-out visitors: no account needed. Staff-only table; the owner is never told.
async function ipHash(): Promise<string> {
  const req = getRequest();
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`roleprove-portfolio-report:${ip}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const reportPortfolioPublicFn = createServerFn({ method: 'POST' })
  .inputValidator((d: unknown) => z.object({
    slug: z.string().max(60), reason: z.string().max(40), details: z.string().max(2000).optional(),
    email: z.string().max(300).optional(), website: z.string().max(300).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const v = validatePublicReport(data);
    if (!v.ok) return { error: v.error };
    if (v.spam) return { ok: true as const }; // honeypot filled: pretend success, store nothing
    const a = await admin();
    const hash = await ipHash();
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error: cErr } = await a.from('portfolio_reports').select('id', { count: 'exact', head: true }).eq('ip_hash', hash).gte('created_at', since);
    if (cErr) return { error: 'Could not send the report.' };
    if ((count ?? 0) >= PUBLIC_REPORTS_PER_HOUR) return { error: 'You\u2019ve sent several reports recently. Please try again later.' };
    const { error } = await a.from('portfolio_reports').insert({ slug: v.value.slug, reason: v.value.reason, details: v.value.details, contact_email: v.value.email, ip_hash: hash });
    if (error) return { error: 'Could not send the report.' };
    return { ok: true as const };
  });

export const staffUnpublishFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: slugInput }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc('is_support_staff', { _user_id: context.userId });
    if (staff !== true) return { error: 'Only support staff can do this.' };
    const { data: rows, error } = await (await admin()).from('portfolios').update({ is_public: false }).eq('slug', data.slug).select('user_id');
    if (error) return { error: 'Could not unpublish.' };
    return rows?.length ? { ok: true } : { error: 'No portfolio uses that link name.' };
  });
