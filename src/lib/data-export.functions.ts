import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { EXPORTS_PER_DAY, isRecentSignIn } from './data-export';

type Fail = { error: string; code: 'reauth' | 'limit' | 'section' | 'email' | 'other' };

export const requestDataExport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Fail | { exportId: string; url: string; expiresAt: string; largeRecordings: number }> => {
    const { userId, claims } = context;
    if (!isRecentSignIn(claims as { amr?: unknown })) return { code: 'reauth', error: 'Please confirm your password to export your data.' };
    const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
    const { buildExport, purgeExpiredExports, ExportSectionError, EXPORT_BUCKET, LINK_SECONDS } = await import('./data-export.server');
    await purgeExpiredExports(admin).catch((e) => console.error('purge exports', e));

    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error: countErr } = await admin.from('data_exports').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).neq('status', 'failed').gte('created_at', since);
    if (countErr) return { code: 'other', error: 'Could not check your export limit. Please try again.' };
    if ((count ?? 0) >= EXPORTS_PER_DAY) return { code: 'limit', error: 'You can export your data once a day. Please try again tomorrow.' };

    const { data: user, error: userErr } = await admin.auth.admin.getUserById(userId);
    if (userErr || !user.user) return { code: 'other', error: 'Could not load your account.' };
    const { data: row, error: insErr } = await admin.from('data_exports').insert({ user_id: userId }).select('id').single();
    if (insErr || !row) return { code: 'other', error: 'Could not start your export.' };
    const fail = async (section: string, out: Fail) => { await admin.from('data_exports').update({ status: 'failed', failed_section: section }).eq('id', row.id); return out; };

    try {
      const { sendTemplateEmail } = await import('./email-templates/send-email');
      if (user.user.email) await sendTemplateEmail('data-export-requested', user.user.email, { idempotencyKey: `data-export-${row.id}`, templateData: { requestedAt: new Date().toUTCString() } });
    } catch (e) {
      console.error('export email', e);
      return fail('confirmation email', { code: 'email', error: 'We could not send the confirmation email, so the export was stopped. Please try again later.' });
    }

    let built;
    try { built = await buildExport(admin, userId, { email: user.user.email ?? null, createdAt: user.user.created_at }); }
    catch (e) {
      if (e instanceof ExportSectionError) { console.error('export section', e.message); return fail(e.section, { code: 'section', error: `Your export was stopped because we could not gather your ${e.section}. Nothing was downloaded. Please try again later or contact support.` }); }
      console.error('export', e);
      return fail('unknown', { code: 'other', error: 'Your export could not be created. Please try again later.' });
    }

    const path = `${userId}/${row.id}.zip`;
    const up = await admin.storage.from(EXPORT_BUCKET).upload(path, new Blob([built.zip as BlobPart], { type: 'application/zip' }), { upsert: true });
    if (up.error) return fail('saving the zip', { code: 'section', error: 'Your export was stopped because the zip could not be saved. Please try again later.' });
    const name = `roleprove-data-${new Date().toISOString().slice(0, 10)}.zip`;
    const signed = await admin.storage.from(EXPORT_BUCKET).createSignedUrl(path, LINK_SECONDS, { download: name });
    if (signed.error || !signed.data) return fail('download link', { code: 'section', error: 'Your export was stopped because the download link could not be created.' });
    const expiresAt = new Date(Date.now() + LINK_SECONDS * 1000).toISOString();
    await admin.from('data_exports').update({ status: 'ready', file_path: path }).eq('id', row.id);
    return { exportId: row.id, url: signed.data.signedUrl, expiresAt, largeRecordings: built.links.length };
  });

/** Called once the browser has the zip: deletes the stored copy. */
export const confirmExportDownloaded = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ exportId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
    const { EXPORT_BUCKET } = await import('./data-export.server');
    const { data: row } = await admin.from('data_exports').select('file_path').eq('id', data.exportId).eq('user_id', context.userId).maybeSingle();
    if (!row) return { ok: false };
    if (row.file_path) {
      const { error } = await admin.storage.from(EXPORT_BUCKET).remove([row.file_path]);
      if (error) return { ok: false };
    }
    await admin.from('data_exports').update({ status: 'downloaded', file_path: null, downloaded_at: new Date().toISOString() }).eq('id', data.exportId);
    return { ok: true };
  });
