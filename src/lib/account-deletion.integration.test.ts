// Real end-to-end erasure check against the backend and Stripe test mode.
// Skips automatically where backend keys are absent (e.g. CI without secrets).
import { describe, expect, it } from 'vitest';

const ready = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.STRIPE_SANDBOX_API_KEY && process.env.LOVABLE_API_KEY);

async function seedAccount() {
    const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
    const { createStripeClient } = await import('./stripe.server');
    const { eraseAccount, listUserFiles, USER_TABLES } = await import('./account-deletion.server');
    const stripe = createStripeClient('sandbox');
    const must = <T,>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => { if (r.error || r.data == null) throw new Error(`${what}: ${r.error?.message ?? "no data"}`); return r.data as NonNullable<T>; };

    const email = `erasure-test-${crypto.randomUUID()}@example.com`;
    const created = await admin.auth.admin.createUser({ email, password: crypto.randomUUID(), email_confirm: true, user_metadata: { name: 'Erasure Test', terms_version: 't', privacy_version: 'p' } });
    if (created.error) throw created.error;
    const uid = created.data.user.id;
    const file = (body: string, type: string) => new Blob([body], { type });

    // Profile is made by the signup trigger; add a headline so it holds data.
    { const r = await admin.from('profiles').update({ headline: 'Analyst' }).eq('id', uid); if (r.error) throw new Error('profile' + ": " + r.error.message); }
    const role = must(await admin.from('roles').select('id').limit(1).single(), 'role');
    const sim = must(await admin.from('simulations').insert({ role_id: role.id, title: 'Personal', description: 'x', estimated_minutes: 30, is_personalized: true, owner_user_id: uid }).select('id').single(), 'simulation');
    const task = must(await admin.from('simulation_tasks').insert({ simulation_id: sim.id, order: 1, title: 'T', brief: 'b', task_type: 'text', rubric_criteria: [] }).select('id').single(), 'task');
    const job = must(await admin.from('job_postings').insert({ user_id: uid, raw_text: 'JD text' }).select('id').single(), 'job');
    const attempt = must(await admin.from('simulation_attempts').insert({ user_id: uid, simulation_id: sim.id, job_posting_id: job.id, status: 'completed', recording_file_path: `${uid}/x.webm` }).select('id').single(), 'attempt');
    { const r = await admin.from('attempt_task_results').insert({ attempt_id: attempt.id, task_id: task.id, response: { a: 'my answer' }, max_score: 10 }); if (r.error) throw new Error('answer' + ": " + r.error.message); }

    const delivPath = `${uid}/${attempt.id}/clean.csv`;
    must(await admin.storage.from('deliverables').upload(delivPath, file('a,b\n1,2', 'text/csv')), 'deliverable file');
    const deliv = must(await admin.from('attempt_deliverables').insert({ attempt_id: attempt.id, task_id: task.id, user_id: uid, file_path: delivPath, file_name: 'clean.csv', file_type: 'csv', extracted_text: 'a,b' }).select('id').single(), 'deliverable');
    { const r = await admin.from('deliverable_gradings').insert({ user_id: uid, attempt_id: attempt.id }); if (r.error) throw new Error('grading' + ": " + r.error.message); }
    { const r = await admin.from('deliverable_flags').insert({ deliverable_id: deliv.id, attempt_id: attempt.id, user_id: uid, reason: 'test' }); if (r.error) throw new Error('flag' + ": " + r.error.message); }

    const cvPath = `${uid}/interview-prep-cv/1-cv.pdf`;
    must(await admin.storage.from('deliverables').upload(cvPath, file('%PDF-1.4', 'application/pdf')), 'cv file');
    const sess = must(await admin.from('interview_prep_sessions').insert({ user_id: uid, source_jd_text: 'JD', cv_file_path: cvPath, cv_extracted_text: 'CV text' }).select('id').single(), 'prep');
    const q = must(await admin.from('interview_prep_questions').insert({ session_id: sess.id, category: 'can_do_job', question_text: 'Q', order_index: 0 }).select('id').single(), 'question');
    { const r = await admin.from('interview_prep_responses').insert({ question_id: q.id, response_text: 'my reply' }); if (r.error) throw new Error('response' + ": " + r.error.message); }

    const live = must(await admin.from('live_interviews').insert({ user_id: uid, prep_session_id: sess.id, role_key: 'data_analyst', length: 'short', plan: [{ pillar: 'can_do_job', question: 'Live Q' }] }).select('id').single(), 'live interview');
    const liveMsg = must(await admin.from('live_interview_messages').insert({ interview_id: live.id, role: 'candidate', content: 'my live answer', msg_type: 'answer', pillar: 'can_do_job', question_index: 0 }).select('id').single(), 'live message');
    { const r = await admin.from('live_interview_flags').insert({ interview_id: live.id, user_id: uid, reason: 'steering test' }); if (r.error) throw new Error('live flag' + ": " + r.error.message); }

    must(await admin.storage.from('attempt-recordings').upload(`${uid}/${attempt.id}.webm`, file('webm', 'video/webm')), 'recording');
    must(await admin.storage.from('credentials').upload(`${uid}/cert.pdf`, file('%PDF-1.4', 'application/pdf')), 'credential file');
    { const r = await admin.from('credentials').insert({ user_id: uid, title: 'Cert', issuer: 'X', file_path: `${uid}/cert.pdf` }); if (r.error) throw new Error('credential' + ": " + r.error.message); }

    const ticket = must(await admin.from('support_tickets').insert({ user_id: uid, category: 'other', subject: 'Help', attempt_id: attempt.id }).select('id').single(), 'ticket');
    const msg = must(await admin.from('support_messages').insert({ ticket_id: ticket.id, sender: 'user', body: 'hi' }).select('id').single(), 'message');
    { const { notify } = await import('./notifications.server'); const r = await notify(admin, { userId: uid, type: 'support_reply', title: 'Support replied to your ticket', link: `/support/${ticket.id}`, relatedType: 'support_message', relatedId: msg.id }); if (!r.created) throw new Error('notification: ' + r.reason); }
    { const r = await admin.from('notification_settings').insert({ user_id: uid, email_support_reply: false }); if (r.error) throw new Error('notification settings: ' + r.error.message); }
    const shot = `${uid}/${crypto.randomUUID()}.png`;
    must(await admin.storage.from('support-attachments').upload(shot, file('png', 'image/png')), 'screenshot');
    { const r = await admin.from('support_attachments').insert({ message_id: msg.id, file_path: shot, file_name: 's.png' }); if (r.error) throw new Error('attachment' + ": " + r.error.message); }
    { const r = await admin.from('billing_usage').insert({ user_id: uid, kind: 'simulation', environment: 'sandbox' }); if (r.error) throw new Error('usage' + ": " + r.error.message); }

    // Public portfolio with a photo and one project.
    const slug = `del-${uid.slice(0, 8)}`;
    must(await admin.storage.from('portfolio-photos').upload(`${uid}/photo-1.jpg`, file('jpg', 'image/jpeg')), 'portfolio photo');
    { const r = await admin.from('portfolios').insert({ user_id: uid, slug, is_public: true, consented_at: new Date().toISOString(), bio: 'Portfolio bio', photo_path: `${uid}/photo-1.jpg` }); if (r.error) throw new Error('portfolio: ' + r.error.message); }
    { const r = await admin.from('portfolio_projects').insert({ user_id: uid, attempt_id: attempt.id, insight: 'Portfolio insight' }); if (r.error) throw new Error('portfolio project: ' + r.error.message); }
    const listing = must(await admin.from('job_center_jobs').insert({ title:'Deletion test job',company:'Test',arrangement:'remote',employment:'full-time',role_key:'data_analyst',seniority:'entry',summary:'Test',apply_url:'https://example.com',status:'published' }).select('id').single(),'job listing');
    must(await admin.from('job_center_private').insert({job_id:listing.id,practice_text:'STAFF PRIVATE',staff_notes:'STAFF NOTE',submitter_name:'PRIVATE SUBMITTER',submitter_email:'private-submitter@example.com'}).select('job_id').single(),'private listing');
    must(await admin.from('job_tracker').insert({user_id:uid,job_id:listing.id,status:'applied',notes:'My job note'}).select('id').single(),'tracker');
    must(await admin.from('job_preferences').insert({user_id:uid,roles:['data_analyst'],countries:['Nigeria']}).select('user_id').single(),'preferences');

    // Application profile with a project, plus one frozen snapshot and consent.
    { const r = await admin.from('application_profiles').insert({ user_id: uid, headline: 'App headline', project_attempt_ids: [attempt.id] }); if (r.error) throw new Error('application profile: ' + r.error.message); }
    { const { createSnapshot } = await import('./application-profile.server'); await createSnapshot(admin, uid, { employerRef: 'test-employer' }); }

    // Real Stripe test-mode subscription (trial, so no card needed).
    const customer = await stripe.customers.create({ email, name: 'Erasure Test', metadata: { userId: uid } });
    const price = (await stripe.prices.list({ lookup_keys: ['roleprove_practice_prep_monthly'], limit: 1 })).data[0];
    const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: price.id }], trial_period_days: 7, metadata: { userId: uid } });
    { const r = await admin.from('subscriptions').insert({ user_id: uid, stripe_subscription_id: sub.id, stripe_customer_id: customer.id, price_id: 'roleprove_practice_prep_monthly', status: sub.status, environment: 'sandbox' }); if (r.error) throw new Error('subscription' + ": " + r.error.message); }

    return { admin, stripe, must, eraseAccount, listUserFiles, USER_TABLES, email, uid, slug, sim, task, attempt, sess, q, ticket, msg, customer, live, liveMsg, listing };
}

describe.skipIf(!ready)('account deletion removes everything', () => {
  it('leaves no rows, files, sign-in account or Stripe customer behind', async () => {
    const { admin, stripe, must, eraseAccount, listUserFiles, USER_TABLES, email, uid, slug, sim, task, attempt, sess, q, ticket, msg, customer, live, liveMsg, listing } = await seedAccount();
    const legal = must(await admin.from('legal_acceptances').select('id').eq('user_id', uid), 'legal');
    expect(legal.length).toBeGreaterThan(0);
    expect((await listUserFiles(admin, uid)).length).toBe(6);
    const { loadPublicPortfolioRow } = await import('./portfolio.server');
    expect((await loadPublicPortfolioRow(admin, slug))?.user_id).toBe(uid);

    const result = await eraseAccount({ admin, userId: uid, stripeFor: (env) => (env === 'sandbox' ? stripe : null) });
    expect(USER_TABLES.map((t) => t.table)).toEqual(expect.arrayContaining(['notifications', 'notification_settings', 'application_profiles', 'application_snapshots', 'application_consents']));
    expect(result.stripe).toEqual([{ env: 'sandbox', customerId: customer.id, action: 'deleted' }]);

    for (const { table, column } of USER_TABLES) expect(must(await admin.from(table as never).select('*').eq(column, uid), table), table).toEqual([]);
    expect(must(await admin.from('simulations').select('id').eq('id', sim.id), 'sim')).toEqual([]);
    for (const [t, c, v] of [['attempt_task_results', 'attempt_id', attempt.id], ['attempt_deliverables', 'user_id', uid], ['deliverable_flags', 'user_id', uid], ['interview_prep_questions', 'session_id', sess.id], ['interview_prep_responses', 'question_id', q.id], ['support_messages', 'ticket_id', ticket.id], ['support_attachments', 'message_id', msg.id], ['simulation_tasks', 'id', task.id], ['live_interview_messages', 'interview_id', live.id], ['live_interview_flags', 'interview_id', live.id]] as const)
      expect(must(await admin.from(t as never).select('*').eq(c, v), t), t).toEqual([]);
    expect(await listUserFiles(admin, uid)).toEqual([]);
    expect((await admin.from('job_tracker').select('id').eq('user_id',uid)).data).toEqual([]);
    expect((await admin.from('job_preferences').select('user_id').eq('user_id',uid)).data).toEqual([]);
    await admin.from('job_center_jobs').delete().eq('id',listing.id);
    // The public page and photo now resolve to "not found" (same lookup the page and photo address use).
    expect(await loadPublicPortfolioRow(admin, slug)).toBeNull();
    expect((await admin.storage.from('portfolio-photos').list(uid)).data).toEqual([]);
    expect((await admin.auth.admin.getUserById(uid)).data.user).toBeNull();
    expect((await stripe.customers.retrieve(customer.id)).deleted).toBe(true);

    // Deliberately kept: the hashed email that blocks a second free trial.
    const hash = must(await admin.rpc('billing_email_hash', { p_email: email }), 'hash');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const kept = must(await admin.from('billing_trial_history').select('email_hash').eq('email_hash', hash), 'trial');
    expect(kept.length).toBe(1);
    { const r = await admin.from('billing_trial_history').delete().eq('email_hash', kept[0].email_hash); if (r.error) throw new Error('cleanup test trial row' + ": " + r.error.message); }
  }, 120_000);

  it('exports every data type the account holds, then the export is deleted with the account', async () => {
    const { admin, stripe, eraseAccount, uid, email, listing } = await seedAccount();
    try {
      const { unzipSync, strFromU8 } = await import('fflate');
      const { buildExport, SECTIONS, NOT_INCLUDED } = await import('./data-export.server');
      const { zip, counts } = await buildExport(admin, uid, { email, createdAt: new Date().toISOString() });
      const files = unzipSync(zip);
      const names = Object.keys(files);
      // Every data section is present and holds this account's rows.
      for (const s of SECTIONS) {
        expect(counts[s.file], s.label).toBeGreaterThan(0);
        expect(strFromU8(files[`data/${s.file}.csv`]).split('\n').length, s.file).toBeGreaterThan(2);
      }
      const all = JSON.parse(strFromU8(files['data/all_data.json']));
      expect(all.account.email).toBe(email);
      expect(all.attempt_answers[0].response).toEqual({ a: 'my answer' });
      expect(all.interview_prep_sessions[0].cv_extracted_text).toBe('CV text');
      expect(all.interview_prep_replies[0].response_text).toBe('my reply');
      expect(all.live_interviews[0].role_key).toBe('data_analyst');
      expect(all.live_interview_messages[0].content).toBe('my live answer');
      expect(all.support_messages[0].body).toBe('hi');
      expect(all.job_postings[0].raw_text).toBe('JD text');
      expect(all.subscriptions[0].status).toBe('trialing');
      expect(all.portfolio[0].bio).toBe('Portfolio bio');
      expect(all.portfolio[0].is_public).toBe(true);
      expect(all.portfolio_projects[0].insight).toBe('Portfolio insight');
      expect(all.job_tracker[0].status).toBe('applied');
      expect(all.job_tracker[0].notes).toBe('My job note');
      expect(all.job_preferences[0].countries).toEqual(['Nigeria']);
      expect(all.application_profile[0].headline).toBe('App headline');
      expect(all.application_consents[0].employer_ref).toBe('test-employer');
      expect(all.application_consents[0].wording_version).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(all.application_snapshots[0].content.headline).toBe('App headline');
      expect(JSON.stringify(all)).not.toContain('STAFF PRIVATE');
      expect(JSON.stringify(all)).not.toContain('STAFF NOTE');
      expect(JSON.stringify(all)).not.toContain('PRIVATE SUBMITTER');
      expect(JSON.stringify(all)).not.toContain('private-submitter@example.com');
      // Staff-only data stays out.
      expect(all.support_tickets[0]).not.toHaveProperty('tags');
      expect(all.support_tickets[0]).not.toHaveProperty('staff_last_read_at');
      expect(names.some((n) => n.includes('flag'))).toBe(false);
      expect(JSON.stringify(all)).not.toContain('"reason":"test"');
      expect(JSON.stringify(all)).not.toContain('steering test');
      // All six files are inside the zip.
      for (const prefix of ['files/deliverables/', 'files/deliverables/interview-prep-cv/', 'files/attempt-recordings/', 'files/credentials/', 'files/support-attachments/', 'files/portfolio-photos/'])
        expect(names.some((n) => n.startsWith(prefix)), prefix).toBe(true);
      expect(names.filter((n) => n.startsWith('files/')).length).toBe(6);
      const readme = strFromU8(files['README.txt']);
      for (const s of SECTIONS) expect(readme).toContain(`data/${s.file}.csv`);
      expect(readme).toContain(NOT_INCLUDED[0]);
      // A stored export zip is removed by account deletion.
      { const r = await admin.storage.from('data-exports').upload(`${uid}/e.zip`, new Blob([zip as BlobPart])); if (r.error) throw r.error; }
      { const r = await admin.from('data_exports').insert({ user_id: uid, status: 'ready', file_path: `${uid}/e.zip` }); if (r.error) throw r.error; }
    } finally {
      await eraseAccount({ admin, userId: uid, stripeFor: (env) => (env === 'sandbox' ? stripe : null) });
      await admin.from('job_center_jobs').delete().eq('id',listing.id);
      const hash = (await admin.rpc('billing_email_hash', { p_email: email })).data;
      if (hash) await admin.from('billing_trial_history').delete().eq('email_hash', hash);
    }
    expect((await admin.storage.from('data-exports').list(uid)).data).toEqual([]);
    expect((await admin.from('data_exports').select('id').eq('user_id', uid)).data).toEqual([]);
  }, 120_000);

  it('a deleted email signing up again keeps its original trial record (keyed hash, no plain MD5)', async () => {
    const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
    const { eraseAccount } = await import('./account-deletion.server');
    const { createHash } = await import('node:crypto');
    const email = `trial-test-${crypto.randomUUID()}@example.com`;
    const make = async () => { const r = await admin.auth.admin.createUser({ email, password: crypto.randomUUID(), email_confirm: true, user_metadata: { name: 'T', terms_version: 't', privacy_version: 'p' } }); if (r.error) throw r.error; return r.data.user.id; };
    const hash = (await admin.rpc('billing_email_hash', { p_email: `  ${email.toUpperCase()} ` })).data as string;
    try {
      const first = await make();
      const before = (await admin.from('billing_trial_history').select('first_signup_at').eq('email_hash', hash)).data;
      expect(before?.length).toBe(1);
      expect((await admin.from('billing_trial_history').select('email_hash').eq('email_hash', createHash('md5').update(email).digest('hex'))).data).toEqual([]);
      await eraseAccount({ admin, userId: first, stripeFor: () => null });
      await new Promise((r) => setTimeout(r, 1100));
      const second = await make();
      const access = await admin.rpc('billing_access_for', { p_user: second, p_env: 'sandbox' });
      expect(access.error).toBeNull();
      const after = (await admin.from('billing_trial_history').select('first_signup_at').eq('email_hash', hash)).data;
      expect(after).toEqual(before);
      await eraseAccount({ admin, userId: second, stripeFor: () => null });
    } finally {
      await admin.from('billing_trial_history').delete().eq('email_hash', hash);
    }
  }, 60_000);
});
