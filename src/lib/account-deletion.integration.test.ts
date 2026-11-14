// Real end-to-end erasure check against the backend and Stripe test mode.
// Skips automatically where backend keys are absent (e.g. CI without secrets).
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

const ready = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.STRIPE_SANDBOX_API_KEY && process.env.LOVABLE_API_KEY);

describe.skipIf(!ready)('account deletion removes everything', () => {
  it('leaves no rows, files, sign-in account or Stripe customer behind', async () => {
    const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
    const { createStripeClient } = await import('./stripe.server');
    const { eraseAccount, listUserFiles, USER_TABLES } = await import('./account-deletion.server');
    const stripe = createStripeClient('sandbox');
    const must = <T,>(r: { data: T; error: { message: string } | null }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

    const email = `erasure-test-${crypto.randomUUID()}@example.com`;
    const created = await admin.auth.admin.createUser({ email, password: crypto.randomUUID(), email_confirm: true, user_metadata: { name: 'Erasure Test', terms_version: 't', privacy_version: 'p' } });
    if (created.error) throw created.error;
    const uid = created.data.user.id;
    const file = (body: string, type: string) => new Blob([body], { type });

    // Profile is made by the signup trigger; add a headline so it holds data.
    must(await admin.from('profiles').update({ headline: 'Analyst' }).eq('id', uid), 'profile');
    const role = must(await admin.from('roles').select('id').limit(1).single(), 'role');
    const sim = must(await admin.from('simulations').insert({ role_id: role.id, title: 'Personal', description: 'x', estimated_minutes: 30, is_personalized: true, owner_user_id: uid }).select('id').single(), 'simulation');
    const task = must(await admin.from('simulation_tasks').insert({ simulation_id: sim.id, order: 1, title: 'T', brief: 'b', task_type: 'text', rubric_criteria: [] }).select('id').single(), 'task');
    const job = must(await admin.from('job_postings').insert({ user_id: uid, raw_text: 'JD text' }).select('id').single(), 'job');
    const attempt = must(await admin.from('simulation_attempts').insert({ user_id: uid, simulation_id: sim.id, job_posting_id: job.id, status: 'completed', recording_file_path: `${uid}/x.webm` }).select('id').single(), 'attempt');
    must(await admin.from('attempt_task_results').insert({ attempt_id: attempt.id, task_id: task.id, response: { a: 'my answer' }, max_score: 10 }), 'answer');

    const delivPath = `${uid}/${attempt.id}/clean.csv`;
    must(await admin.storage.from('deliverables').upload(delivPath, file('a,b\n1,2', 'text/csv')), 'deliverable file');
    const deliv = must(await admin.from('attempt_deliverables').insert({ attempt_id: attempt.id, task_id: task.id, user_id: uid, file_path: delivPath, file_name: 'clean.csv', file_type: 'csv', extracted_text: 'a,b' }).select('id').single(), 'deliverable');
    must(await admin.from('deliverable_gradings').insert({ user_id: uid, attempt_id: attempt.id }), 'grading');
    must(await admin.from('deliverable_flags').insert({ deliverable_id: deliv.id, attempt_id: attempt.id, user_id: uid, reason: 'test' }), 'flag');

    const cvPath = `${uid}/interview-prep-cv/1-cv.pdf`;
    must(await admin.storage.from('deliverables').upload(cvPath, file('%PDF-1.4', 'application/pdf')), 'cv file');
    const sess = must(await admin.from('interview_prep_sessions').insert({ user_id: uid, source_jd_text: 'JD', cv_file_path: cvPath, cv_extracted_text: 'CV text' }).select('id').single(), 'prep');
    const q = must(await admin.from('interview_prep_questions').insert({ session_id: sess.id, category: 'can_do_job', question_text: 'Q', order_index: 0 }).select('id').single(), 'question');
    must(await admin.from('interview_prep_responses').insert({ question_id: q.id, response_text: 'my reply' }), 'response');

    must(await admin.storage.from('attempt-recordings').upload(`${uid}/${attempt.id}.webm`, file('webm', 'video/webm')), 'recording');
    must(await admin.storage.from('credentials').upload(`${uid}/cert.pdf`, file('%PDF-1.4', 'application/pdf')), 'credential file');
    must(await admin.from('credentials').insert({ user_id: uid, title: 'Cert', issuer: 'X', file_path: `${uid}/cert.pdf` }), 'credential');

    const ticket = must(await admin.from('support_tickets').insert({ user_id: uid, category: 'other', subject: 'Help', attempt_id: attempt.id }).select('id').single(), 'ticket');
    const msg = must(await admin.from('support_messages').insert({ ticket_id: ticket.id, sender: 'user', body: 'hi' }).select('id').single(), 'message');
    const shot = `${uid}/${crypto.randomUUID()}.png`;
    must(await admin.storage.from('support-attachments').upload(shot, file('png', 'image/png')), 'screenshot');
    must(await admin.from('support_attachments').insert({ message_id: msg.id, file_path: shot, file_name: 's.png' }), 'attachment');
    must(await admin.from('billing_usage').insert({ user_id: uid, kind: 'simulation', environment: 'sandbox' }), 'usage');

    // Real Stripe test-mode subscription (trial, so no card needed).
    const customer = await stripe.customers.create({ email, name: 'Erasure Test', metadata: { userId: uid } });
    const price = (await stripe.prices.list({ lookup_keys: ['roleprove_practice_prep_monthly'], limit: 1 })).data[0];
    const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: price.id }], trial_period_days: 7, metadata: { userId: uid } });
    must(await admin.from('subscriptions').insert({ user_id: uid, stripe_subscription_id: sub.id, stripe_customer_id: customer.id, price_id: 'roleprove_practice_prep_monthly', status: sub.status, environment: 'sandbox' }), 'subscription');

    const legal = must(await admin.from('legal_acceptances').select('id').eq('user_id', uid), 'legal');
    expect(legal.length).toBeGreaterThan(0);
    expect((await listUserFiles(admin, uid)).length).toBe(6);

    const result = await eraseAccount({ admin, userId: uid, stripeFor: (env) => (env === 'sandbox' ? stripe : null) });
    expect(result.stripe).toEqual([{ env: 'sandbox', customerId: customer.id, action: 'deleted' }]);

    for (const { table, column } of USER_TABLES) expect(must(await admin.from(table as never).select('*').eq(column, uid), table), table).toEqual([]);
    expect(must(await admin.from('simulations').select('id').eq('id', sim.id), 'sim')).toEqual([]);
    for (const [t, c, v] of [['attempt_task_results', 'attempt_id', attempt.id], ['attempt_deliverables', 'user_id', uid], ['deliverable_flags', 'user_id', uid], ['interview_prep_questions', 'session_id', sess.id], ['interview_prep_responses', 'question_id', q.id], ['support_messages', 'ticket_id', ticket.id], ['support_attachments', 'message_id', msg.id], ['simulation_tasks', 'id', task.id]] as const)
      expect(must(await admin.from(t as never).select('*').eq(c, v), t), t).toEqual([]);
    expect(await listUserFiles(admin, uid)).toEqual([]);
    expect((await admin.auth.admin.getUserById(uid)).data.user).toBeNull();
    expect((await stripe.customers.retrieve(customer.id)).deleted).toBe(true);

    // Deliberately kept: the hashed email that blocks a second free trial.
    const kept = must(await admin.from('billing_trial_history').select('email_hash').eq('email_hash', createHash('md5').update(email.toLowerCase()).digest('hex')), 'trial');
    expect(kept.length).toBe(1);
    must(await admin.from('billing_trial_history').delete().eq('email_hash', kept[0].email_hash), 'cleanup test trial row');
  }, 120_000);
});
