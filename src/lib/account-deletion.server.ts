import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

export type StripeEnvName = 'sandbox' | 'live';
/** Every private file store whose paths start with {userId}/. */
export const USER_BUCKETS = ['credentials', 'deliverables', 'attempt-recordings', 'support-attachments', 'data-exports', 'portfolio-photos'] as const;
/**
 * Rows keyed by user, deleted parent-first so child rows go with them
 * (task results, uploads, gradings, flags, prep questions/answers, ticket messages/attachments).
 * Personalised simulations are removed when the sign-in account is deleted (owner cascade).
 */
export const USER_TABLES: Array<{ table: string; column: string }> = [
  { table: 'company_join_requests', column: 'user_id' },
  { table: 'company_members', column: 'user_id' },
  { table: 'account_types', column: 'user_id' },
  { table: 'application_consents', column: 'user_id' },
  { table: 'application_snapshots', column: 'user_id' },
  { table: 'application_profiles', column: 'user_id' },
  { table: 'notification_settings', column: 'user_id' },
  { table: 'job_tracker', column: 'user_id' },
  { table: 'job_preferences', column: 'user_id' },
  { table: 'portfolio_projects', column: 'user_id' },
  { table: 'portfolios', column: 'user_id' },
  { table: 'support_tickets', column: 'user_id' },
  { table: 'simulation_attempts', column: 'user_id' },
  { table: 'live_interviews', column: 'user_id' },
  { table: 'interview_prep_sessions', column: 'user_id' },
  { table: 'job_postings', column: 'user_id' },
  { table: 'credentials', column: 'user_id' },
  { table: 'billing_usage', column: 'user_id' },
  { table: 'deliverable_gradings', column: 'user_id' },
  { table: 'legal_acceptances', column: 'user_id' },
  { table: 'data_exports', column: 'user_id' },
  { table: 'subscriptions', column: 'user_id' },
  { table: 'profiles', column: 'id' },
  // After profiles: a late Stripe cancellation webhook can still create a notice until the profile is gone (sendBillingEmail stops at a missing profile).
  { table: 'notifications', column: 'user_id' },
];

const DONE = ['canceled', 'incomplete_expired'];
const OPEN_DISPUTE = ['warning_needs_response', 'warning_under_review', 'needs_response', 'under_review'];

export type StripeOutcome = { env: StripeEnvName; customerId: string; action: 'deleted' | 'redacted'; reason?: string };

/** True when the customer must be kept for an open dispute or unpaid invoice. */
export async function stripeHoldReason(stripe: Stripe, customerId: string): Promise<string | null> {
  const open = await stripe.invoices.list({ customer: customerId, status: 'open', limit: 1 });
  if (open.data.length) return 'unpaid invoice';
  const charges = await stripe.charges.list({ customer: customerId, limit: 100 });
  for (const c of charges.data) {
    if (!c.disputed) continue;
    const disputes = await stripe.disputes.list({ charge: c.id, limit: 10 });
    if (disputes.data.some((d) => OPEN_DISPUTE.includes(d.status))) return 'open dispute';
  }
  return null;
}

/** Cancels subscriptions, then deletes the customer (or strips name, email and user ID when it must be kept). */
export async function eraseStripeCustomer(stripe: Stripe, env: StripeEnvName, userId: string, knownCustomerIds: string[]): Promise<StripeOutcome[]> {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) throw new Error('Invalid userId');
  const ids = new Set(knownCustomerIds);
  const found = await stripe.customers.search({ query: `metadata['userId']:'${userId}'`, limit: 100 });
  for (const c of found.data) ids.add(c.id);
  const outcomes: StripeOutcome[] = [];
  for (const id of ids) {
    const customer = await stripe.customers.retrieve(id).catch((e: { code?: string }) => { if (e?.code === 'resource_missing') return null; throw e; });
    if (!customer || customer.deleted) continue;
    const subs = await stripe.subscriptions.list({ customer: id, status: 'all', limit: 100 });
    for (const s of subs.data) {
      if (DONE.includes(s.status)) continue;
      // Stripe test mode is eventually consistent: a just-created subscription can 404 on cancel.
      await stripe.subscriptions.cancel(s.id, { invoice_now: false, prorate: false }).catch((e: { code?: string }) => { if (e?.code !== 'resource_missing') throw e; });
    }
    const hold = await stripeHoldReason(stripe, id);
    if (hold) {
      await stripe.customers.update(id, { name: '', email: '', description: '', phone: '', metadata: { userId: '' } });
      outcomes.push({ env, customerId: id, action: 'redacted', reason: hold });
    } else {
      await stripe.customers.del(id);
      outcomes.push({ env, customerId: id, action: 'deleted' });
    }
  }
  return outcomes;
}

async function listAll(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  return (await listAllSized(admin, bucket, prefix)).map((f) => f.path);
}

async function listAllSized(admin: SupabaseClient, bucket: string, prefix: string): Promise<Array<{ path: string; size: number }>> {
  const out: Array<{ path: string; size: number }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`Could not list ${bucket}: ${error.message}`);
    for (const e of data ?? []) {
      const path = `${prefix}/${e.name}`;
      if (e.id) out.push({ path, size: Number((e.metadata as { size?: number } | null)?.size ?? 0) });
      else out.push(...(await listAllSized(admin, bucket, path)));
    }
    if (!data || data.length < 1000) return out;
  }
}

export async function listUserFiles(admin: SupabaseClient, userId: string) {
  const all: Array<{ bucket: string; path: string }> = [];
  for (const bucket of USER_BUCKETS) for (const path of await listAll(admin, bucket, userId)) all.push({ bucket, path });
  return all;
}

/** Files in one bucket under {userId}/, with sizes (used by the data export). */
export function listUserBucketFiles(admin: SupabaseClient, bucket: string, userId: string) {
  return listAllSized(admin, bucket, userId);
}

/**
 * Full account erasure. Order: Stripe (stops charges) → files → rows → sign-in account.
 * Any failed step stops the run and throws, so a retry picks up where it left off.
 * Kept on purpose: billing_trial_history (hashed email, blocks repeat free trials).
 */
export async function eraseAccount(opts: {
  admin: SupabaseClient; userId: string;
  stripeFor: (env: StripeEnvName) => Stripe | null;
}): Promise<{ stripe: StripeOutcome[] }> {
  const { admin, userId } = opts;
  // Employer accounts: an owner with team members must transfer ownership first; the last member starts the company's deletion notice.
  const { prepareEmployerErasure } = await import('./employer-accounts.server');
  await prepareEmployerErasure(admin, userId);
  const stripe: StripeOutcome[] = [];
  for (const env of ['sandbox', 'live'] as const) {
    const client = opts.stripeFor(env);
    if (!client) continue;
    const { data, error } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', userId).eq('environment', env);
    if (error) throw new Error(`Could not read subscriptions: ${error.message}`);
    stripe.push(...(await eraseStripeCustomer(client, env, userId, (data ?? []).map((r) => r.stripe_customer_id))));
  }
  for (const bucket of USER_BUCKETS) {
    const paths = await listAll(admin, bucket, userId);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) throw new Error(`Could not delete files in ${bucket}: ${error.message}`);
    }
  }
  for (const { table, column } of USER_TABLES) {
    const { error } = await admin.from(table as never).delete().eq(column, userId);
    if (error) throw new Error(`Could not delete ${table}: ${error.message}`);
  }
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError && !/not found/i.test(authError.message)) throw authError;
  return { stripe };
}
