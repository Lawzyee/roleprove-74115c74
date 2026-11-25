import { describe, it, expect, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => new Request('http://localhost') }));
const ready = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

describe.skipIf(!ready)('employer data rules', () => {
  it('keeps waitlist and sessions staff/server-only and cleans up on schedule', async () => {
    const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
    const { cleanEmployerData } = await import('./employer.server');
    const tag = crypto.randomUUID(); const jobIds: string[] = []; let uid = '';
    const base = { title: 'Employer cleanup ' + tag, company: 'QA', arrangement: 'remote', employment: 'full-time', role_key: 'data_analyst', seniority: 'entry', summary: 'QA', apply_url: 'https://example.com/' + tag, source_type: 'employer_submitted' };
    try {
      const w = await admin.from('employer_waitlist').insert([
        { email: `old-${tag}@example.com`, remove_token_hash: 'x', created_at: daysAgo(8), confirmed_at: null },
        { email: `new-${tag}@example.com`, remove_token_hash: 'x', created_at: new Date().toISOString(), confirmed_at: null },
        { email: `kept-${tag}@example.com`, remove_token_hash: 'x', created_at: daysAgo(30), confirmed_at: daysAgo(30) },
      ]); if (w.error) throw w.error;
      const mk = async (extra: Record<string, unknown>, priv: Record<string, unknown>) => { const j = await admin.from('job_center_jobs').insert({ ...base, ...extra }).select('id').single(); if (j.error) throw j.error; jobIds.push(j.data.id); const p = await admin.from('job_center_private').insert({ job_id: j.data.id, submitter_name: 'QA', submitter_email: `s-${tag}@example.com`, ...priv }); if (p.error) throw p.error; return j.data.id; };
      const oldPending = await mk({ status: 'pending_review', created_at: daysAgo(31) }, {});
      const newPending = await mk({ status: 'pending_review', created_at: new Date().toISOString() }, {});
      const oldRejected = await mk({ status: 'rejected', created_at: daysAgo(100) }, { reviewed_at: daysAgo(91) });
      const removed = await mk({ status: 'hidden', deleted_at: daysAgo(91) }, { reviewed_at: daysAgo(120) });
      // A signed-in non-staff member cannot read the waitlist, sessions or private contacts.
      const email = `emp-test-${tag}@example.com`, password = crypto.randomUUID();
      const u = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (u.error) throw u.error; uid = u.data.user.id;
      const member = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
      const login = await member.auth.signInWithPassword({ email, password }); if (login.error) throw login.error;
      expect((await member.from('employer_waitlist').select('id')).data ?? []).toEqual([]);
      expect((await member.from('employer_sessions').select('id')).data ?? []).toEqual([]);
      expect((await member.from('job_center_private').select('job_id').in('job_id', jobIds)).data ?? []).toEqual([]);
      expect((await member.from('job_center_jobs').select('id').in('id', jobIds)).data ?? []).toEqual([]);

      await cleanEmployerData(admin);
      const emails = (await admin.from('employer_waitlist').select('email').like('email', `%${tag}%`)).data!.map(r => r.email).sort();
      expect(emails).toEqual([`kept-${tag}@example.com`, `new-${tag}@example.com`]);
      const left = (await admin.from('job_center_jobs').select('id').in('id', jobIds)).data!.map(r => r.id);
      expect(left).not.toContain(oldPending); expect(left).not.toContain(oldRejected);
      expect(left).toContain(newPending); expect(left).toContain(removed);
      const contact = await admin.from('job_center_private').select('submitter_email').eq('job_id', removed).single();
      expect(contact.data?.submitter_email).toBe('');
    } finally {
      await admin.from('employer_waitlist').delete().like('email', `%${tag}%`);
      if (jobIds.length) await admin.from('job_center_jobs').delete().in('id', jobIds);
      if (uid) await admin.auth.admin.deleteUser(uid);
    }
  }, 60000);
});
