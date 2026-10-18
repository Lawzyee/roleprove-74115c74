import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { createStripeClient, getStripeErrorMessage } from './stripe.server';
import { syncSubscription } from './billing.server';
import { PRACTICE_PRICE, type BillingAccess } from './billing';

const environment = z.enum(['sandbox', 'live']).refine((env) => {
  const token = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;
  return env === (token?.startsWith('pk_test_') ? 'sandbox' : token?.startsWith('pk_live_') ? 'live' : null);
}, 'Payments are not configured for this environment.');

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error('Invalid userId');
  if (options.userId) {
    const found = await stripe.customers.search({ query: `metadata['userId']:'${options.userId}'`, limit: 1 });
    const first = found.data[0];
    if (first) return first.id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    const customer = existing.data[0];
    if (customer) {
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, { metadata: { ...customer.metadata, userId: options.userId } });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({ ...(options.email && { email: options.email }), ...(options.userId && { metadata: { userId: options.userId } }) });
  return created.id;
}

export const getBillingAccessFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ environment }).parse(data))
  .handler(async ({ data, context }): Promise<BillingAccess> => {
    const { data: access, error } = await context.supabase.rpc('get_billing_access', { p_env: data.environment });
    if (error) throw new Error(error.message);
    return access as unknown as BillingAccess;
  });

export const createCheckoutSession = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ environment, origin: z.string().url() }).parse(data))
  .handler(async ({ data, context }) => {
    try {
      const stripe = createStripeClient(data.environment);
      const { data: auth, error } = await context.supabase.auth.getUser();
      if (error || !auth.user) throw new Error('Please sign in again.');
      const customer = await resolveOrCreateCustomer(stripe, { userId: context.userId, email: auth.user.email });
      const existing = await stripe.subscriptions.list({ customer, status: 'all', limit: 100 });
      if (existing.data.some((s) => ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status))) throw new Error('You already have a subscription. Manage it in Billing instead.');
      // A failed first payment leaves an 'incomplete' subscription; cancel it so the customer can retry cleanly.
      for (const s of existing.data.filter((s) => s.status === 'incomplete')) await stripe.subscriptions.cancel(s.id);
      const prices = await stripe.prices.list({ lookup_keys: [PRACTICE_PRICE], active: true });
      const price = prices.data[0];
      if (!price) throw new Error('Practice/Prep price is unavailable.');
      const origin = new URL(data.origin).origin;
      const session = await stripe.checkout.sessions.create({
        ui_mode: 'embedded_page', mode: 'subscription', customer,
        line_items: [{ price: price.id, quantity: 1 }],
        return_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
        metadata: { userId: context.userId }, subscription_data: { metadata: { userId: context.userId } },
      });
      if (!session.client_secret) throw new Error('Stripe did not return a checkout form.');
      return { clientSecret: session.client_secret };
    } catch (error) { return { error: getStripeErrorMessage(error) }; }
  });

export const createPortalSession = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ environment, origin: z.string().url() }).parse(data))
  .handler(async ({ data, context }) => {
    try {
      const { data: sub, error } = await context.supabase.from('subscriptions').select('stripe_customer_id').eq('user_id', context.userId).eq('environment', data.environment).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!sub) throw new Error('No subscription found.');
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: `${new URL(data.origin).origin}/settings` });
      return { url: portal.url };
    } catch (error) { return { error: getStripeErrorMessage(error) }; }
  });

export const confirmCheckout = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ environment, sessionId: z.string().regex(/^cs_[a-zA-Z0-9_]+$/) }).parse(data))
  .handler(async ({ data, context }) => {
    try {
      const stripe = createStripeClient(data.environment);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);
      if (session.metadata?.userId !== context.userId) throw new Error('Checkout not found for this account.');
      if (session.status !== 'complete' || session.payment_status === 'unpaid') return { state: 'pending' as const };
      const id = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (!id) throw new Error('Subscription not found.');
      await syncSubscription(id, data.environment, context.userId);
      return { state: 'paid' as const };
    } catch (error) { return { error: getStripeErrorMessage(error) }; }
  });

export const deleteAccountFn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ environment }).parse(data))
  .handler(async ({ data, context }) => {
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const userId = context.userId;
      // Cancel billing first: if Stripe fails, nothing is deleted and the customer is never charged for a deleted account.
      const { data: subs, error } = await supabaseAdmin.from('subscriptions').select('stripe_subscription_id, status').eq('user_id', userId).eq('environment', data.environment);
      if (error) throw error;
      const stripe = createStripeClient(data.environment);
      for (const s of subs ?? []) {
        if (['canceled', 'incomplete_expired'].includes(s.status)) continue;
        const live = await stripe.subscriptions.retrieve(s.stripe_subscription_id);
        if (!['canceled', 'incomplete_expired'].includes(live.status)) await stripe.subscriptions.cancel(live.id, { invoice_now: false, prorate: false });
      }
      for (const bucket of ['credentials', 'deliverables']) {
        const { data: files } = await supabaseAdmin.storage.from(bucket).list(userId, { limit: 1000 });
        if (files?.length) await supabaseAdmin.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
      }
      await supabaseAdmin.from('support_tickets').delete().eq('user_id', userId);
      await supabaseAdmin.from('simulation_attempts').delete().eq('user_id', userId);
      await supabaseAdmin.from('interview_prep_sessions').delete().eq('user_id', userId);
      await supabaseAdmin.from('job_postings').delete().eq('user_id', userId);
      await supabaseAdmin.from('credentials').delete().eq('user_id', userId);
      await supabaseAdmin.from('billing_usage').delete().eq('user_id', userId);
      await supabaseAdmin.from('subscriptions').delete().eq('user_id', userId);
      await supabaseAdmin.from('profiles').delete().eq('id', userId);
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authError) throw authError;
      return { ok: true as const };
    } catch (error) { return { error: getStripeErrorMessage(error) }; }
  });
