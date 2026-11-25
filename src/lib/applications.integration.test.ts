import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS, type ProfileSettings } from './application-profile';
import { samplePosting } from './employer-jobs.fixtures';
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => new Request('http://localhost') }));
const ready = Boolean(process.env['SUPABASE_URL'] && process.env['SUPABASE_SERVICE_ROLE_KEY'] && process.env['SUPABASE_PUBLISHABLE_KEY']);
function client() { return createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, { auth: { persistSession: false } }); }
function must<T>(r: { data: T; error: { message: string } | null }, what = 'data'): NonNullable<T> { if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message ?? 'missing'}`); return r.data; }
const file = (t: string, type: string) => new Blob([t], { type });

describe.skipIf(!ready)('apply in RoleProve (live database)', () => {
  it('apply, view, status, withdraw, suspension, rate limit and deletion', { timeout: 240000 }, async () => {
    const { supabaseAdmin: a } = await import('@/integrations/supabase/client.server');
    const s = await import('./applications.server'); const { eraseAccount } = await import('./account-deletion.server');
    const tag = crypto.randomUUID().slice(0, 8); const ids: string[] = []; const companies: string[] = [];
    const user = async (kind: 'employer' | 'candidate', local: string) => {
      const email = `${local}-${tag}@example.com`, password = crypto.randomUUID();
      const cu = await a.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { account_type: kind } }); if (cu.error || !cu.data.user) throw new Error('user'); const u = cu.data.user; ids.push(u.id);
      const db = client(); const l = await db.auth.signInWithPassword({ email, password }); if (l.error) throw l.error; return { id: u.id, db };
    };
    const company = async (owner: string, domain: string) => { const c = must(await a.from('companies').insert({ name: `Apply QA ${tag}`, website: `https://${domain}`, email_domain: domain, country: 'Nigeria', size_band: '1-10', industry: 'technology', status: 'approved' }).select('*').single(), 'company'); companies.push(c.id); must(await a.from('company_members').insert({ company_id: c.id, user_id: owner, role: 'owner' }).select('*').single(), 'member'); return c; };
    try {
      const owner = await user('employer', 'owner'), viewer = await user('employer', 'viewer'), other = await user('employer', 'other'), cand = await user('candidate', 'cand');
      const c = await company(owner.id, `apply-${tag}.example.com`); await company(other.id, `apply-other-${tag}.example.com`);
      must(await a.from('company_members').insert({ company_id: c.id, user_id: viewer.id, role: 'viewer' }).select('*').single(), 'viewer');
      const { practice_text: _p, practice_rights: _r, genuine: _g, no_fee: _n, authorised: _a, terms: _t, ...payload } = samplePosting(`https://apply-${tag}.example.com/jobs/1`);
      const job = must(await a.from('employer_jobs').insert({ company_id: c.id, author_id: owner.id, payload: { ...payload, application_method: 'both' }, practice_text: '', status: 'published', flags: [] }).select('id').single(), 'job');
      const projected = must(await a.from('job_center_jobs').select('application_method').eq('id', job.id).single(), 'projection');
      expect(projected.application_method).toBe('both');

      // Candidate sources: a project, a credential, a CV and a second (unticked) credential.
      const sim = must(await a.from('simulations').select('id').eq('is_personalized', false).limit(1).single(), 'sim');
      const att = must(await a.from('simulation_attempts').insert({ user_id: cand.id, simulation_id: sim.id, status: 'completed', overall_score: 72, completed_at: new Date().toISOString() }).select('id').single(), 'attempt');
      const cred = must(await a.from('credentials').insert({ user_id: cand.id, title: 'SQL Cert', issuer: 'Org' }).select('id').single(), 'cred');
      must(await a.from('credentials').insert({ user_id: cand.id, title: 'HIDDEN CREDENTIAL', issuer: 'Org' }).select('id').single(), 'cred2');
      const cvPath = `${cand.id}/interview-prep-cv/1-cv.pdf`; must(await a.storage.from('deliverables').upload(cvPath, file('%PDF-1.4 cv', 'application/pdf')), 'cv');
      const sess = must(await a.from('interview_prep_sessions').insert({ user_id: cand.id, source_jd_text: 'JD', cv_file_path: cvPath }).select('id').single(), 'prep');
      const settings: ProfileSettings = { ...DEFAULT_SETTINGS, display_name: 'Ada Applicant', include_headline: false, project_attempt_ids: [att.id], credential_ids: [cred.id], cv_session_id: sess.id };

      // 1. Apply; employer sees exactly those items; second application refused; consent filled in.
      await expect(s.submitApplication(a, cand.id, { jobId: job.id, settings, coverNote: 'Hi', consent: false })).rejects.toThrow(/consent/);
      const app = await s.submitApplication(a, cand.id, { jobId: job.id, settings, coverNote: 'Hello there', consent: true });
      await expect(s.submitApplication(a, cand.id, { jobId: job.id, settings, coverNote: '', consent: true })).rejects.toThrow(/already applied/);
      const row = must(await a.from('job_applications').select('snapshot_id,consent_id,cv_copy_path').eq('id', app.id).single(), 'app row');
      const consent = must(await a.from('application_consents').select('employer_ref,job_id').eq('id', row.consent_id!).single(), 'consent');
      expect(consent).toEqual({ employer_ref: c.id, job_id: job.id });
      expect(row.cv_copy_path).toMatch(new RegExp(`^${cand.id}/${row.snapshot_id}/`));
      const list = await s.listApplicants(owner.db, a, owner.id, job.id);
      expect(list.rows.map(r => r.name)).toEqual(['Ada Applicant']);
      const opened = await s.openApplication(owner.db, a, owner.id, app.id);
      if (!opened.view) throw new Error('no view');
      expect(opened.view.projects?.map(p => p.attemptId)).toEqual([att.id]);
      expect(opened.view.credentials?.map(x => x.title)).toEqual(['SQL Cert']);
      expect(opened.view.headline).toBeUndefined(); expect(opened.view.cv?.filePath).toBe(''); expect(JSON.stringify(opened)).not.toContain('HIDDEN CREDENTIAL');
      expect(opened.status).toBe('viewed'); expect(opened.coverNote).toBe('Hello there');
      const log = must(await a.from('application_access_log').select('member_id,action').eq('application_id', app.id), 'log');
      expect(log).toEqual([{ member_id: owner.id, action: 'open' }]);
      // Staff-only access log: the employer and candidate cannot read it.
      expect((await owner.db.from('application_access_log').select('id')).data ?? []).toEqual([]);
      expect((await cand.db.from('application_access_log').select('id')).data ?? []).toEqual([]);

      // 2. Editing the profile afterwards does not change the snapshot. 3. Deleting the prep session keeps the CV copy.
      await a.from('application_profiles').upsert({ user_id: cand.id, ...DEFAULT_SETTINGS, display_name: 'Changed Name' });
      await a.from('interview_prep_sessions').delete().eq('id', sess.id); await a.storage.from('deliverables').remove([cvPath]);
      const again = await s.openApplication(owner.db, a, owner.id, app.id); expect(again.view?.name).toBe('Ada Applicant');
      const link = await s.cvLink(owner.db, a, owner.id, app.id); expect(link.url).toContain('application-cvs'); expect(link.url).toContain('token=');
      expect((await fetch(link.url)).status).toBe(200);

      // 5. Status: recruiter/owner yes with inbox notice, viewer no, other company cannot see.
      await s.setApplicationStatus(owner.db, a, owner.id, app.id, 'shortlisted');
      const note = must(await a.from('notifications').select('type,link').eq('user_id', cand.id).eq('related_id', `${app.id}:shortlisted`).single(), 'notice');
      expect(note).toEqual({ type: 'application_update', link: '/applications' });
      await expect(s.setApplicationStatus(viewer.db, a, viewer.id, app.id, 'interview')).rejects.toThrow(/owners and recruiters/i);
      await expect(s.openApplication(other.db, a, other.id, app.id)).rejects.toThrow(/not found/i);
      await expect(s.listApplicants(other.db, a, other.id, job.id)).rejects.toThrow(/not found/i);
      expect((await other.db.from('job_applications').select('id').eq('id', app.id)).data ?? []).toEqual([]);
      expect((await owner.db.from('job_applications').select('id,status').eq('id', app.id)).data).toEqual([{ id: app.id, status: 'shortlisted' }]);
      expect((await owner.db.from('job_applications').select('cover_note').eq('id', app.id)).error).not.toBeNull();
      expect((await owner.db.from('application_snapshots').select('id')).data ?? []).toEqual([]);
      const emp = must(await a.from('notifications').select('related_type').eq('user_id', owner.id).eq('related_type', 'job_applications_new'), 'employer notice'); expect(emp.length).toBe(1);

      // 6. Suspension removes access; reinstatement restores it.
      must(await a.from('companies').update({ status: 'suspended', status_reason: 'test' }).eq('id', c.id).select('id').single(), 'suspend');
      await expect(s.listApplicants(owner.db, a, owner.id, job.id)).rejects.toThrow();
      expect((await owner.db.from('job_applications').select('id').eq('id', app.id)).data ?? []).toEqual([]);
      must(await a.from('companies').update({ status: 'approved' }).eq('id', c.id).select('id').single(), 'reinstate');
      expect((await s.listApplicants(owner.db, a, owner.id, job.id)).rows.length).toBe(1);

      // 8. Open rate limit.
      await a.from('app_settings').update({ application_opens_per_hour: 2 }).eq('id', true);
      try { await expect(s.openApplication(viewer.db, a, viewer.id, app.id)).resolves.toBeTruthy(); await expect(s.openApplication(viewer.db, a, viewer.id, app.id)).resolves.toBeTruthy(); await expect(s.openApplication(viewer.db, a, viewer.id, app.id)).rejects.toThrow(/try again/); }
      finally { await a.from('app_settings').update({ application_opens_per_hour: 60 }).eq('id', true); }

      // 4. Withdraw: employer access and the CV copy go; employer sees "Withdrawn by candidate"; can apply again.
      await s.withdrawApplication(a, cand.id, app.id);
      expect((await a.storage.from('application-cvs').list(`${cand.id}/${row.snapshot_id}`)).data ?? []).toEqual([]);
      expect((await s.listApplicants(owner.db, a, owner.id, job.id)).rows[0]?.name).toBe('Withdrawn by candidate');
      expect((await s.openApplication(owner.db, a, owner.id, app.id)).withdrawn).toBe(true);
      await expect(s.cvLink(owner.db, a, owner.id, app.id)).rejects.toThrow();
      const app2 = await s.submitApplication(a, cand.id, { jobId: job.id, settings: { ...settings, cv_session_id: null }, coverNote: '', consent: true });

      // Closed jobs refuse new applications.
      await a.from('employer_jobs').update({ status: 'paused' }).eq('id', job.id);
      expect((await s.applyContext(a, cand.id, job.id)).problem).not.toBeNull();
      await a.from('employer_jobs').update({ status: 'published' }).eq('id', job.id);

      // 7. Deleting the candidate account: everything gone, employer sees withdrawn.
      await eraseAccount({ admin: a, userId: cand.id, stripeFor: () => null });
      expect((await a.from('application_snapshots').select('id').eq('user_id', cand.id)).data).toEqual([]);
      const rows = must(await a.from('job_applications').select('user_id,status,cover_note,snapshot_id').in('id', [app.id, app2.id]), 'anon');
      expect(rows.every(r => r.user_id === null && r.status === 'withdrawn' && r.snapshot_id === null && r.cover_note === '')).toBe(true);
      expect((await s.listApplicants(owner.db, a, owner.id, job.id)).rows.every(r => r.name === 'Withdrawn by candidate')).toBe(true);
    } finally {
      for (const cid of companies) { await a.from('job_applications').delete().eq('company_id', cid); await a.from('company_members').delete().eq('company_id', cid); await a.from('companies').delete().eq('id', cid); }
      for (const id of ids) { await a.from('job_applications').delete().eq('user_id', id); await a.from('notifications').delete().eq('user_id', id); await a.from('application_access_log').delete().eq('member_id', id); await a.from('application_snapshots').delete().eq('user_id', id); await a.from('credentials').delete().eq('user_id', id); await a.from('simulation_attempts').delete().eq('user_id', id); await a.from('interview_prep_sessions').delete().eq('user_id', id); await a.from('application_profiles').delete().eq('user_id', id); await a.from('account_types').delete().eq('user_id', id); await a.auth.admin.deleteUser(id); }
    }
  });

  it('company deletion and retention delete snapshots and CV copies but keep a history row', { timeout: 120000 }, async () => {
    const { supabaseAdmin: a } = await import('@/integrations/supabase/client.server');
    const s = await import('./applications.server');
    const tag = crypto.randomUUID().slice(0, 8);
    const cu = await a.auth.admin.createUser({ email: `ret-${tag}@example.com`, password: crypto.randomUUID(), email_confirm: true }); if (cu.error || !cu.data.user) throw new Error('user'); const u = cu.data.user;
    const c = must(await a.from('companies').insert({ name: `Ret ${tag}`, website: `https://ret-${tag}.example.com`, email_domain: `ret-${tag}.example.com`, country: 'Nigeria', size_band: '1-10', industry: 'technology', status: 'approved' }).select('id').single(), 'company');
    try {
      const mk = async () => { const snap = must(await a.from('application_snapshots').insert({ user_id: u.id, content: { name: 'X', contact: { mode: 'inbox' } }, included_items: ['name'] }).select('id').single(), 'snap'); const p = `${u.id}/${snap.id}/cv.pdf`; must(await a.storage.from('application-cvs').upload(p, file('%PDF', 'application/pdf')), 'copy'); return must(await a.from('job_applications').insert({ user_id: u.id, company_id: c.id, snapshot_id: snap.id, job_title: 'J', company_name: 'C', cv_copy_path: p }).select('id,snapshot_id,cv_copy_path').single(), 'app'); };
      // Retention: an application whose job ended 7 months ago is purged by the hourly cleanup.
      const old = await mk();
      await a.from('job_applications').update({ job_ended_at: new Date(Date.now() - 210 * 86400000).toISOString(), status: 'job_closed' }).eq('id', old.id);
      await s.cleanApplications(a);
      const o = must(await a.from('job_applications').select('purged_at,snapshot_id,job_title').eq('id', old.id).single(), 'old');
      expect(o.purged_at).not.toBeNull(); expect(o.snapshot_id).toBeNull(); expect(o.job_title).toBe('J');
      expect((await a.from('application_snapshots').select('id').eq('id', old.snapshot_id!)).data).toEqual([]);
      // Company deletion.
      const live = await mk(); await a.from('job_applications').update({ job_ended_at: new Date().toISOString() }).eq('id', live.id);
      await s.retireCompanyApplications(a, c.id);
      const l = must(await a.from('job_applications').select('status,purged_at').eq('id', live.id).single(), 'live');
      expect(l.status).toBe('job_closed'); expect(l.purged_at).not.toBeNull();
      expect((await a.storage.from('application-cvs').list(u.id, { limit: 100 })).data?.filter(f => f.id) ?? []).toEqual([]);
      expect(must(await a.from('notifications').select('id').eq('user_id', u.id).eq('related_id', `${live.id}:company_deleted`), 'notice').length).toBe(1);
    } finally {
      await a.from('job_applications').delete().eq('user_id', u.id); await a.from('notifications').delete().eq('user_id', u.id); await a.from('application_snapshots').delete().eq('user_id', u.id);
      await a.from('companies').delete().eq('id', c.id); await a.from('account_types').delete().eq('user_id', u.id); await a.auth.admin.deleteUser(u.id);
    }
  });
});
