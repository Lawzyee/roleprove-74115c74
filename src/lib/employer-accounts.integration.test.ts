// Live checks against the real backend: privilege escalation is refused, and the full employer flow works end to end.
import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => new Request('http://localhost') }));
const ready = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_PUBLISHABLE_KEY);
const userClient = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const company = (domain: string) => ({ name: 'QA Co', website: `https://${domain}`, country: 'UK', size_band: '1-10' as const, industry: 'technology' as const, description: 'QA', registration_number: '', public_page_url: '' });

describe.skipIf(!ready)('employer accounts (live)', () => {
  it('sign-up account data cannot grant employer, company membership or staff', async () => {
    const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
    const tag = crypto.randomUUID().slice(0, 8); const ids: string[] = [];
    const { data: c } = await admin.from('companies').insert({ ...company(`bait-${tag}.example.com`), email_domain: `bait-${tag}.example.com` }).select('id').single();
    try {
      const extras = { is_support_staff: true, is_employer: true, company_id: c!.id, company_role: 'owner', role: 'owner', kind: 'employer', staff: true };
      const u = await admin.auth.admin.createUser({ email: `cand-${tag}@example.com`, password: crypto.randomUUID(), email_confirm: true, user_metadata: { name: 'QA', terms_version: 't', privacy_version: 'p', ...extras } });
      if (u.error) throw u.error; ids.push(u.data.user.id);
      const uid = u.data.user.id;
      expect((await admin.from('account_types').select('kind').eq('user_id', uid).single()).data!.kind).toBe('candidate');
      expect((await admin.from('profiles').select('is_support_staff').eq('id', uid).single()).data!.is_support_staff).toBe(false);
      expect((await admin.from('company_members').select('user_id').eq('user_id', uid)).data).toEqual([]);
      const g = await admin.auth.admin.createUser({ email: `p-${tag}@gmail.com`, password: crypto.randomUUID(), email_confirm: true, user_metadata: { account_type: 'employer', ...extras } });
      expect(g.error).toBeTruthy();
      if (g.data?.user) ids.push(g.data.user.id);
    } finally { await admin.from('companies').delete().eq('id', c!.id); for (const id of ids) await admin.auth.admin.deleteUser(id); }
  });

  it('a signed-in user cannot edit their own profile or the database into employer, member or staff', async () => {
    const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
    const tag = crypto.randomUUID().slice(0, 8); const email = `edit-${tag}@example.com`, password = crypto.randomUUID();
    const u = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (u.error) throw u.error;
    const uid = u.data.user.id;
    const { data: c } = await admin.from('companies').insert({ ...company(`e-${tag}.example.com`), email_domain: `e-${tag}.example.com` }).select('id').single();
    try {
      const me = userClient(); const l = await me.auth.signInWithPassword({ email, password }); if (l.error) throw l.error;
      await me.from('profiles').update({ is_support_staff: true }).eq('id', uid);
      await me.auth.updateUser({ data: { account_type: 'employer', is_support_staff: true } });
      expect((await me.from('account_types').insert({ user_id: uid, kind: 'employer' })).error).toBeTruthy();
      await me.from('account_types').update({ kind: 'employer' }).eq('user_id', uid);
      expect((await me.from('company_members').insert({ company_id: c!.id, user_id: uid, role: 'owner' })).error).toBeTruthy();
      expect((await me.from('companies').insert({ ...company(`x-${tag}.example.com`), email_domain: `x-${tag}.example.com`, status: 'approved' })).error).toBeTruthy();
      await me.from('companies').update({ status: 'approved' }).eq('id', c!.id);
      expect((await me.rpc('is_support_staff', { _user_id: uid })).data).toBe(false);
      expect((await me.rpc('is_employer', { _user_id: uid })).data).toBe(false);
      expect((await admin.from('profiles').select('is_support_staff').eq('id', uid).single()).data!.is_support_staff).toBe(false);
      expect((await admin.from('account_types').select('kind').eq('user_id', uid).single()).data!.kind).toBe('candidate');
      expect((await admin.from('company_members').select('user_id').eq('user_id', uid)).data).toEqual([]);
      expect((await admin.from('companies').select('status').eq('id', c!.id).single()).data!.status).toBe('pending');
    } finally { await admin.from('companies').delete().eq('id', c!.id); await admin.auth.admin.deleteUser(uid); }
  });

  it('employer flow: confirm email, set up company, staff approve, invite, remove, delete', { timeout: 120_000 }, async () => {
    const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
    const srv = await import('./employer-accounts.server');
    const { eraseAccount } = await import('./account-deletion.server');
    const tag = crypto.randomUUID().slice(0, 8); const domain = `qa${tag}.example.com`; const made: string[] = []; let companyId = '';
    const meta = { name: 'QA Owner', account_type: 'employer', employer_terms_version: 'e', privacy_version: 'p' };
    // Unconfirmed employer sign-up; the confirmation-link click is stood in for by marking the email confirmed
    // (tests can't read a real inbox, and minting sign-in links from tests is not allowed).
    const signUpAndConfirm = async (email: string) => {
      const g = await admin.auth.admin.createUser({ email, password: crypto.randomUUID(), email_confirm: false, user_metadata: meta });
      if (g.error) throw g.error; made.push(g.data.user.id);
      expect(g.data.user.email_confirmed_at ?? null).toBeNull();
      await expect(srv.createCompany(admin, g.data.user.id, company(domain))).rejects.toThrow(/confirm your email/);
      const c = await admin.auth.admin.updateUserById(g.data.user.id, { email_confirm: true }); if (c.error) throw c.error;
      expect((await admin.auth.admin.getUserById(g.data.user.id)).data.user!.email_confirmed_at).toBeTruthy();
      await admin.from('notification_settings').upsert({ user_id: g.data.user.id, email_account: false });
      return g.data.user.id;
    };
    try {
      const owner = await signUpAndConfirm(`owner@${domain}`);
      expect((await admin.from('account_types').select('kind').eq('user_id', owner).single()).data!.kind).toBe('employer');
      const created = await srv.createCompany(admin, owner, company(domain));
      expect('companyId' in created).toBe(true); companyId = (created as { companyId: string }).companyId;
      await expect(srv.createInvite(admin, owner, `col@${domain}`, 'viewer', { email: false })).rejects.toThrow(/reviewed/);
      const st = await admin.auth.admin.createUser({ email: `staff-${tag}@example.com`, password: crypto.randomUUID(), email_confirm: true }); if (st.error) throw st.error; made.push(st.data.user.id);
      await admin.from('profiles').update({ is_support_staff: true }).eq('id', st.data.user.id);
      await expect(srv.staffAction(admin, st.data.user.id, companyId, 'reject', '', { email: false })).rejects.toThrow(/reason/);
      const ap = await srv.staffAction(admin, st.data.user.id, companyId, 'approve', '', { email: false });
      expect(ap.status).toBe('approved');
      const state = await srv.getEmployerState(admin, owner);
      expect(state.levels).toEqual(['Work email confirmed', 'Reviewed by RoleProve']);
      await expect(srv.createInvite(admin, owner, `x@other-${tag}.example.com`, 'viewer', { email: false })).rejects.toThrow(/Invites can only go/);
      const inv = await srv.createInvite(admin, owner, `col@${domain}`, 'recruiter', { email: false });
      const col = await signUpAndConfirm(`col@${domain}`);
      await srv.acceptInvite(admin, col, { token: inv.token }, { employerTerms: 'e', privacy: 'p' });
      expect((await admin.from('company_members').select('role').eq('user_id', col).single()).data!.role).toBe('recruiter');
      await expect(srv.acceptInvite(admin, col, { token: inv.token }, { employerTerms: 'e', privacy: 'p' })).rejects.toThrow();
      await expect(srv.prepareEmployerErasure(admin, owner)).rejects.toThrow(/Transfer company ownership/);
      await expect(srv.removeMember(admin, col, owner)).rejects.toThrow(/owner/);
      await srv.removeMember(admin, owner, col);
      expect((await admin.from('company_members').select('user_id').eq('user_id', col)).data).toEqual([]);
      await expect(srv.listTeam(admin, col)).rejects.toThrow(/not a member/);
      const actions = (await admin.from('company_audit_log').select('action,actor_kind').eq('company_id', companyId).order('created_at')).data!.map((r) => `${r.actor_kind}:${r.action}`);
      console.log('audit', actions);
      expect(actions[0]).toBe('employer:company_created'); expect(actions[1]).toBe('staff:approve');
      expect(actions).toContain('employer:member_invited'); expect(actions.at(-1)).toBe('employer:member_removed');
      for (const uid of [col, owner]) { await eraseAccount({ admin, userId: uid, stripeFor: () => null }); made.splice(made.indexOf(uid), 1); }
      for (const uid of [col, owner]) {
        expect((await admin.auth.admin.getUserById(uid)).data.user ?? null).toBeNull();
        expect((await admin.from('account_types').select('user_id').eq('user_id', uid)).data).toEqual([]);
      }
      expect((await admin.from('companies').select('delete_after').eq('id', companyId).single()).data!.delete_after).toBeTruthy();
      expect((await admin.from('company_audit_log').select('id').eq('company_id', companyId).in('actor_id', [owner, col])).data).toEqual([]);
    } finally {
      if (companyId) await admin.from('companies').delete().eq('id', companyId);
      for (const id of made) await admin.auth.admin.deleteUser(id);
    }
  });
});
