import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
const ready = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_PUBLISHABLE_KEY);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

describe.skipIf(!ready)('inbox data rules', () => {
  it('owner-only access, duplicate guard, rate limit, job trigger and cleanup', async () => {
    const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
    const { notify, cleanNotifications } = await import('./notifications.server');
    const tag = crypto.randomUUID(); const users: string[] = []; let jobId = '';
    const mkUser = async () => { const email = `inbox-${crypto.randomUUID()}@example.com`, password = crypto.randomUUID();
      const u = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (u.error) throw u.error; users.push(u.data.user.id);
      const c = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
      const l = await c.auth.signInWithPassword({ email, password }); if (l.error) throw l.error; return { id: u.data.user.id, c }; };
    try {
      const a = await mkUser(), b = await mkUser();
      // Turn email off so the test sends no mail.
      await admin.from('notification_settings').insert([{ user_id: a.id, email_support_reply: false }, { user_id: b.id, email_support_reply: false }]);
      const base = { userId: a.id, type: 'support_reply' as const, title: 'Support replied', link: '/support/x', relatedType: 'support_message', relatedId: tag };
      expect((await notify(admin, base)).created).toBe(true);
      expect((await notify(admin, base)).reason).toBe('duplicate');
      expect((await notify(admin, { ...base, relatedId: 'y', link: 'https://evil.com' })).reason).toBe('bad_link');
      const { error: badInsert } = await a.c.from('notifications').insert({ user_id: a.id, type: 'account', title: 'x' } as never);
      expect(badInsert).not.toBeNull();
      // Another user sees nothing and cannot change or delete it.
      expect((await b.c.from('notifications').select('id')).data).toEqual([]);
      await b.c.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', a.id);
      await b.c.from('notifications').delete().eq('user_id', a.id);
      const mine = (await a.c.from('notifications').select('id,read_at')).data!;
      expect(mine.length).toBe(1); expect(mine[0]!.read_at).toBeNull();
      // Owner can mark read.
      await a.c.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', mine[0]!.id);
      expect((await a.c.from('notifications').select('read_at').single()).data!.read_at).not.toBeNull();
      // Rate limit: 20 per hour.
      for (let i = 0; i < 25; i++) await notify(admin, { ...base, userId: b.id, relatedId: `${tag}-${i}` });
      expect((await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', b.id)).count).toBe(20);
      // Saved job expiring twice -> one notification.
      const j = await admin.from('job_center_jobs').insert({ title: 'Inbox QA ' + tag, company: 'QA', arrangement: 'remote', employment: 'full-time', role_key: 'data_analyst', seniority: 'entry', summary: 'QA', apply_url: 'https://example.com/' + tag, status: 'published' }).select('id').single();
      if (j.error) throw j.error; jobId = j.data.id;
      await admin.from('job_tracker').insert({ user_id: a.id, job_id: jobId, status: 'saved' });
      await admin.from('job_center_jobs').update({ status: 'expired' }).eq('id', jobId);
      await admin.from('job_center_jobs').update({ status: 'published' }).eq('id', jobId);
      await admin.from('job_center_jobs').update({ status: 'hidden' }).eq('id', jobId);
      const jobNotes = (await admin.from('notifications').select('link').eq('user_id', a.id).eq('type', 'job_unavailable')).data!;
      expect(jobNotes).toEqual([{ link: '/jobs/tracker' }]);
      // Cleanup: read > 90 days and anything > 180 days go; newer stay.
      await admin.from('notifications').insert([
        { user_id: a.id, type: 'account', title: 'old read', read_at: daysAgo(91), created_at: daysAgo(100), related_id: tag + 'r' },
        { user_id: a.id, type: 'account', title: 'old unread', created_at: daysAgo(181), related_id: tag + 'u' },
        { user_id: a.id, type: 'account', title: 'recent read', read_at: daysAgo(10), created_at: daysAgo(20), related_id: tag + 'k' },
      ]);
      await cleanNotifications(admin);
      const titles = (await admin.from('notifications').select('title').eq('user_id', a.id).eq('type', 'account')).data!.map(r => r.title);
      expect(titles).toEqual(['recent read']);
    } finally {
      if (jobId) { await admin.from('job_tracker').delete().eq('job_id', jobId); await admin.from('job_center_jobs').delete().eq('id', jobId); }
      for (const u of users) { await admin.from('notifications').delete().eq('user_id', u); await admin.from('notification_settings').delete().eq('user_id', u); await admin.from('profiles').delete().eq('id', u); await admin.auth.admin.deleteUser(u); }
    }
  }, 120_000);
});
