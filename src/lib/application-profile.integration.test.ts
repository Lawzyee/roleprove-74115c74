// Live check: snapshots are frozen in the database, withdrawal removes access, other users can't read.
import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const ready = !!(process.env['SUPABASE_URL'] && process.env['SUPABASE_SERVICE_ROLE_KEY'] && process.env['SUPABASE_PUBLISHABLE_KEY']);

describe.skipIf(!ready)('application share snapshots', () => {
  it('freezes content, withdraws, and stays owner-only', async () => {
    const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
    const { createSnapshot, withdrawSnapshot, readSnapshotForEmployer } = await import('./application-profile.server');
    const { eraseAccount } = await import('./account-deletion.server');
    const mk = async () => {
      const email = `share-test-${crypto.randomUUID()}@example.com`; const password = crypto.randomUUID();
      const r = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Share Test', terms_version: 't', privacy_version: 'p' } });
      if (r.error) throw r.error; return { id: r.data.user.id, email, password };
    };
    const owner = await mk(), other = await mk();
    try {
      { const r = await admin.from('application_profiles').insert({ user_id: owner.id, headline: 'Before', bio: 'Hidden bio' }); if (r.error) throw r.error; }
      const snap = await createSnapshot(admin, owner.id, { employerRef: 'acme' });
      expect(snap.items).toEqual(['name', 'headline']);
      expect(JSON.stringify(snap.content)).not.toContain('Hidden bio');

      await admin.from('application_profiles').update({ headline: 'After edit' }).eq('user_id', owner.id);
      expect((await readSnapshotForEmployer(admin, snap.snapshotId))?.headline).toBe('Before');
      // Even the server's own privileged access cannot change a snapshot or consent.
      expect((await admin.from('application_snapshots').update({ content: { name: 'x' } }).eq('id', snap.snapshotId)).error?.message).toMatch(/cannot be changed/);
      expect((await admin.from('application_consents').update({ included_items: ['name', 'bio'] }).eq('id', snap.consentId)).error?.message).toMatch(/cannot be changed/);

      const client = async (u: { email: string; password: string }) => {
        const c = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, { auth: { persistSession: false } });
        const { error } = await c.auth.signInWithPassword(u); if (error) throw error; return c;
      };
      const oc = await client(owner), xc = await client(other);
      expect((await oc.from('application_snapshots').select('id')).data?.length).toBe(1);
      for (const t of ['application_profiles', 'application_snapshots', 'application_consents'])
        expect((await xc.from(t as never).select('*').eq('user_id', owner.id)).data, t).toEqual([]);
      // The owner cannot write directly either.
      await oc.from('application_snapshots').update({ content: { name: 'hack' } }).eq('id', snap.snapshotId);
      await oc.from('application_snapshots').insert({ user_id: owner.id, content: {}, included_items: ['phone'] });
      expect((await admin.from('application_snapshots').select('id').eq('user_id', owner.id)).data?.length).toBe(1);

      expect((await withdrawSnapshot(admin, owner.id, snap.snapshotId)).withdrawn).toBe(true);
      expect(await readSnapshotForEmployer(admin, snap.snapshotId)).toBeNull();
      expect((await admin.from('application_consents').select('withdrawn_at').eq('id', snap.consentId).single()).data?.withdrawn_at).not.toBeNull();
      expect((await admin.from('application_snapshots').update({ withdrawn_at: null }).eq('id', snap.snapshotId)).error).not.toBeNull();
    } finally {
      for (const u of [owner, other]) {
        await eraseAccount({ admin, userId: u.id, stripeFor: () => null });
        const h = (await admin.rpc('billing_email_hash', { p_email: u.email })).data;
        if (h) await admin.from('billing_trial_history').delete().eq('email_hash', h);
      }
    }
    expect((await admin.from('application_snapshots').select('id').eq('user_id', owner.id)).data).toEqual([]);
  }, 60_000);
});
