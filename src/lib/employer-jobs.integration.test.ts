import { describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { dateAfter, type PostingInput } from './employer-jobs';
import { CANDIDATE_DATA_TABLES, samplePosting } from './employer-jobs.fixtures';
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => new Request('http://localhost') }));
const ready = Boolean(process.env['SUPABASE_URL'] && process.env['SUPABASE_SERVICE_ROLE_KEY'] && process.env['SUPABASE_PUBLISHABLE_KEY']);
function client() { const url = process.env['SUPABASE_URL']; const key = process.env['SUPABASE_PUBLISHABLE_KEY']; if (!url || !key) throw new Error('Missing live test configuration'); return createClient(url, key, { auth: { persistSession: false } }); }
function must<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> { if (r.error || !r.data) throw new Error(r.error?.message ?? 'Missing test data'); return r.data; }
describe.skipIf(!ready)('employer job posting (live database)', () => {
  it('company-owned posting, review, roles, separation, counters, expiry and deletion', { timeout: 180000 }, async () => {
    const { supabaseAdmin: a } = await import('@/integrations/supabase/client.server');
    const s = await import('./employer-jobs.server'); const { prepareEmployerErasure } = await import('./employer-accounts.server');
    const ids: string[] = []; const companyIds: string[] = []; const tag = crypto.randomUUID().slice(0, 8); const emails: string[] = []; const safe = vi.fn(async () => true);
    // DNS/TLS is injected only into this live database lifecycle test; the production checker is never bypassed.
    const user = async (kind: 'employer' | 'candidate', local: string) => {
      const email = `${local}-${tag}@example.com`; emails.push(email); const password = crypto.randomUUID();
      const created = await a.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { account_type: kind } }); if(created.error)throw created.error;const u=created.data.user;if(!u)throw new Error('Missing user'); ids.push(u.id);
      const db = client(); const login=await db.auth.signInWithPassword({ email, password });if(login.error)throw login.error; await a.from('notification_settings').upsert({ user_id: u.id, email_account: false }); return { id: u.id, db };
    };
    const company = async (ownerId: string, role: string, domain: string) => {
      const c = must(await a.from('companies').insert({ name: `Posting QA ${tag}`, website: `https://${domain}`, email_domain: domain, country: 'Nigeria', size_band: '1-10', industry: 'technology', status: 'approved' }).select('*').single()); companyIds.push(c.id);
      must(await a.from('company_members').insert({ company_id: c.id, user_id: ownerId, role }).select('*').single()); return c;
    };
    let trackedJob = '';
    try {
      const owner = await user('employer', 'owner'); const viewer = await user('employer', 'viewer'); const candidate = await user('candidate', 'candidate'); const stranger = await user('employer', 'stranger'); const staff = await user('candidate', 'staff');
      await a.from('profiles').update({ is_support_staff: true }).eq('id', staff.id);
      const c = await company(owner.id, 'owner', `posting-${tag}.example.com`); const other = await company(stranger.id, 'owner', `other-${tag}.example.com`);
      must(await a.from('company_members').insert({ company_id: c.id, user_id: viewer.id, role: 'viewer' }).select('*').single());
      const input = samplePosting(`https://${c.email_domain}/jobs/analyst`);
      await expect(s.savePosting(viewer.db, a, viewer.id, input, undefined, true, safe)).rejects.toThrow('Owners and recruiters');
      await expect(s.savePosting(candidate.db, a, candidate.id, input, undefined, true, safe)).rejects.toThrow('Employer accounts');
      const j = await s.savePosting(owner.db, a, owner.id, input, undefined, true, safe); trackedJob = j.id;
      expect(j.status).toBe('pending_review'); expect(safe).toHaveBeenCalledWith(input.apply_url);
      expect((await owner.db.from('employer_jobs').select('id').eq('id', j.id)).data).toHaveLength(1);
      expect((await viewer.db.from('employer_jobs').select('id').eq('id', j.id)).data).toHaveLength(1);
      expect((await stranger.db.from('employer_jobs').select('id').eq('id', j.id)).data).toEqual([]);
      await owner.db.from('employer_jobs').update({ status: 'published' }).eq('id', j.id);
      expect(must(await a.from('employer_jobs').select('status').eq('id', j.id).single()).status).toBe('pending_review');
      expect((await owner.db.from('employer_jobs').insert({company_id:c.id,payload:input,status:'published'})).error).toBeTruthy();
      expect((await candidate.db.from('job_center_jobs').select('id').eq('id', j.id)).data).toEqual([]);
      await expect(s.moderatePosting(a, candidate.id, j.id, 'approve', '', safe)).rejects.toThrow('Staff only');
      await s.moderatePosting(a, staff.id, j.id, 'approve', '', safe);
      const visible = must(await candidate.db.from('job_center_jobs').select('*').eq('id', j.id).single());
      expect(visible.source_type).toBe('employer_account'); expect(visible.company_approved).toBe(true); expect(visible.full_description).toBe(input.full_description); expect(visible.application_method).toBe('external_link');
      expect(JSON.stringify(visible)).not.toContain('PRIVATE PRACTICE SENTINEL'); expect(visible).not.toHaveProperty('views'); expect(visible).not.toHaveProperty('apply_clicks');
      expect((await candidate.db.from('job_center_private').select('*').eq('job_id', j.id)).data).toEqual([]);
      must(await candidate.db.from('job_tracker').insert({ user_id: candidate.id, job_id: j.id, status: 'saved' }).select('id').single());
      must(await a.from('credentials').insert({ user_id: candidate.id, title: 'QA', issuer: 'QA' }).select('id').single());
      must(await candidate.db.from('job_preferences').insert({ user_id: candidate.id, roles: ['data_analyst'] }).select('user_id').single());
      for (const table of CANDIDATE_DATA_TABLES) { const r = await owner.db.from(table).select('*').limit(10); expect(r.error, table).toBeNull(); expect(r.data, table).toEqual([]); }
      expect((await owner.db.from('employer_jobs').select('id').eq('company_id', other.id)).data).toEqual([]);
      expect((await candidate.db.rpc('record_job_view', { p_job: j.id })).error).toBeNull(); expect((await candidate.db.rpc('increment_job_apply', { p_job: j.id })).error).toBeNull();
      const counts = must(await owner.db.from('employer_jobs').select('views,apply_clicks').eq('id', j.id).single()); expect(counts).toEqual({ views: 1, apply_clicks: 1 });
      expect((await owner.db.rpc('increment_job_apply', { p_job: j.id })).error).toBeTruthy();
      expect((await owner.db.rpc('record_job_view', { p_job: j.id })).error).toBeTruthy();
      expect((await owner.db.rpc('report_job_center', { p_job: j.id, p_reason:'other',p_details:'Employer must not report candidate jobs' })).error).toBeTruthy();
      await a.from('companies').update({ status: 'suspended' }).eq('id', c.id);
      const suspended = must(await candidate.db.from('job_center_jobs').select('status,company_approved').eq('id', j.id).single()); expect(suspended.status).toBe('hidden'); expect(suspended.company_approved).toBe(false);
      await expect(s.savePosting(owner.db, a, owner.id, input, undefined, true, safe)).rejects.toThrow('Approved company');
      const suspendedList = await s.listPostings(owner.db,a,owner.id);expect(suspendedList.rows.some(row=>row.id===j.id)).toBe(true);expect(suspendedList.canWrite).toBe(false);
      await a.from('companies').update({ status: 'pending' }).eq('id', c.id);
      await expect(s.savePosting(owner.db, a, owner.id, input, undefined, true, safe)).rejects.toThrow('Approved company');
      await a.from('companies').update({ status: 'approved' }).eq('id', c.id);
      expect(must(await candidate.db.from('job_center_jobs').select('status').eq('id', j.id).single()).status).toBe('published');
      for (let n = 2; n <= 3; n++) { const p = await s.savePosting(owner.db, a, owner.id, { ...input, title: `Role ${n}`, apply_url: `https://${c.email_domain}/jobs/${n}` }, undefined, true, safe); expect(p.status).toBe('pending_review'); await s.moderatePosting(a, staff.id, p.id, 'approve', '', safe); }
      expect((await s.reviewLevel(a, { ...c, review_every_posting: false, review_reset_at: null })).approvals).toBe(3);
      const auto = await s.savePosting(owner.db, a, owner.id, { ...input, title: 'Fourth role', apply_url: `https://${c.email_domain}/jobs/4` }, undefined, true, safe); expect(auto.status).toBe('published');
      const flagged = await s.savePosting(owner.db, a, owner.id, { ...input, title: 'Flagged role', summary: 'Please pay a fee to apply.', apply_url: `https://${c.email_domain}/jobs/5` }, undefined, true, safe); expect(flagged.status).toBe('pending_review');
      expect(must(await a.from('employer_jobs').select('flags').eq('id', flagged.id).single()).flags).toContain('Possible payment request');
      await expect(s.savePosting(owner.db, a, owner.id, { ...input, title: 'Sixth role' }, undefined, true, safe)).rejects.toThrow('daily submission limit');
      await s.setPostingReview(a, staff.id, c.id, true);
      const edited = await s.savePosting(owner.db, a, owner.id, { ...input, apply_url: `https://${c.email_domain}/jobs/edited` }, j.id, false, safe); expect(edited.status).toBe('pending_review');
      await s.moderatePosting(a, staff.id, j.id, 'approve', '', safe);
      const small = await s.savePosting(owner.db, a, owner.id, { ...edited.payload, summary: 'Updated summary.', practice_text: input.practice_text }, j.id, false, safe); expect(small.status).toBe('published');
      expect((await s.postingAction(owner.db, a, owner.id, j.id, 'pause', undefined, safe)).status).toBe('paused');
      const resumed = await s.postingAction(owner.db, a, owner.id, j.id, 'resume', undefined, safe); expect(resumed.status).toBe('pending_review'); await s.moderatePosting(a, staff.id, j.id, 'approve', '', safe);
      const duplicate = await s.postingAction(owner.db, a, owner.id, j.id, 'duplicate', undefined, safe); expect(duplicate.status).toBe('draft');
      const { SECTIONS } = await import('./data-export.server'); const section = SECTIONS.find(x => x.file === 'employer_jobs'); if (!section) throw new Error('Export section missing');
      const exportRows = await section.load({ admin: a, userId: owner.id, ids: {} }); expect(exportRows.some(x => x['id'] === j.id && x['views'] === 1 && x['apply_clicks'] === 1)).toBe(true); expect(JSON.stringify(exportRows)).not.toContain(candidate.id);
      await s.postingAction(owner.db, a, owner.id, j.id, 'close', undefined, safe);
      expect(must(await a.from('employer_jobs').select('practice_text').eq('id', j.id).single()).practice_text).toBe(''); expect(must(await a.from('job_center_private').select('practice_text').eq('job_id', j.id).single()).practice_text).toBe('');
      await a.from('employer_job_events').update({ created_at: new Date(Date.now() - 86400000).toISOString() }).eq('company_id', c.id).eq('action', 'submitted');
      const renewed = await s.postingAction(owner.db, a, owner.id, j.id, 'renew', dateAfter(90), safe); expect(renewed.payload.expires_date).toBe(dateAfter(90)); expect(renewed.status).toBe('pending_review'); await s.moderatePosting(a, staff.id, j.id, 'approve', '', safe);
      const expiryInput: PostingInput = { ...input, expires_date: dateAfter(3), title: 'Expiring QA', apply_url: `https://${c.email_domain}/jobs/expiry` };
      const exp = await s.savePosting(owner.db, a, owner.id, expiryInput, undefined, true, safe); await s.moderatePosting(a, staff.id, exp.id, 'approve', '', safe);
      await s.cleanEmployerJobs(a, Date.now(), c.id); const expiryNotes = must(await owner.db.from('notifications').select('title').eq('related_id', `${exp.id}:${dateAfter(3)}`)); expect(expiryNotes.some(n => n.title === 'Job expires in 3 days')).toBe(true);
      await s.cleanEmployerJobs(a, Date.now() + 4 * 86400000, c.id); expect(must(await a.from('employer_jobs').select('status,practice_text').eq('id', exp.id).single())).toEqual({ status: 'expired', practice_text: '' });
      expect(must(await owner.db.from('notifications').select('title').like('related_id', `${exp.id}:%`)).some(n => n.title === 'Job expired')).toBe(true);
      await a.from('company_members').delete().eq('user_id', viewer.id); await prepareEmployerErasure(a, owner.id);
      expect(must(await a.from('employer_jobs').select('author_id').eq('id', j.id).single()).author_id).toBeNull();
      await a.from('company_members').delete().eq('user_id', owner.id); must(await a.from('companies').delete().eq('id', c.id).select('id').single());
      expect((await a.from('employer_jobs').select('id').eq('company_id', c.id)).data).toEqual([]); expect((await a.from('job_center_private').select('job_id').eq('job_id', j.id)).data).toEqual([]);
      const tombstone = must(await candidate.db.from('job_center_jobs').select('status,deleted_at').eq('id', j.id).single()); expect(tombstone.status).toBe('hidden'); expect(tombstone.deleted_at).toBeTruthy();
      expect(must(await candidate.db.from('job_tracker').select('job_id').eq('job_id', j.id))).toHaveLength(1);
      expect(must(await candidate.db.from('notifications').select('title').eq('related_type', 'job').eq('related_id', j.id))).toHaveLength(1);
      console.log('LIVE employer job lifecycle passed; pinned link transport injected, candidate separation checked:', CANDIDATE_DATA_TABLES.join(', '));
    } finally {
      for (const cid of companyIds) await a.from('companies').delete().eq('id', cid);
      if (trackedJob) { await a.from('job_tracker').delete().eq('job_id', trackedJob); await a.from('job_center_jobs').delete().eq('id', trackedJob); }
      for (const id of ids) { await a.from('notifications').delete().eq('user_id', id); await a.from('notification_settings').delete().eq('user_id', id); await a.from('job_preferences').delete().eq('user_id', id); await a.from('account_types').delete().eq('user_id', id); await a.auth.admin.deleteUser(id); }
      for (const email of emails) { const hash = await a.rpc('billing_email_hash', { p_email: email }); if (hash.data) await a.from('billing_trial_history').delete().eq('email_hash', hash.data); }
    }
  });
});