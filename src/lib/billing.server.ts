import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { createStripeClient, type StripeEnv } from './stripe.server';
import { PRACTICE_PRICE } from './billing';

export async function withUsage<T>(userId: string, env: StripeEnv, kind: 'simulation' | 'interview_prep', run: () => Promise<T>, resource: (result: T) => string | undefined) {
  const { data, error } = await supabaseAdmin.rpc('reserve_billing_usage', { p_user: userId, p_env: env, p_kind: kind });
  if (error) throw new Error(error.message);
  const reservation = data as { allowed: boolean; reservationId?: string };
  if (!reservation.allowed) return { outcome: 'paywall' as const };
  const id = reservation.reservationId;
  if (!id) throw new Error('Could not reserve practice access.');
  try {
    const result = await run();
    const resourceId = resource(result);
    const { error: saveError } = await supabaseAdmin.from('billing_usage').update({ status: resourceId ? 'succeeded' : 'released', resource_id: resourceId ?? null }).eq('id', id).eq('user_id', userId).eq('environment', env);
    if (saveError) throw new Error(saveError.message);
    return result;
  } catch (error) {
    await supabaseAdmin.from('billing_usage').update({ status: 'released' }).eq('id', id).eq('user_id', userId).eq('environment', env);
    throw error;
  }
}

// Fetch canonical Stripe state on every event: delayed/out-of-order events cannot restore an obsolete status.
export async function syncSubscription(id: string, env: StripeEnv, expectedUserId?: string) {
  const stripe = createStripeClient(env);
  const sub = await stripe.subscriptions.retrieve(id);
  const userId = sub.metadata.userId;
  if (!userId || (expectedUserId && userId !== expectedUserId)) throw new Error('Subscription does not belong to this account.');
  const item = sub.items.data[0];
  if (!item) throw new Error('Subscription has no items.');
  const priceId = item.price.lookup_key || item.price.metadata.lovable_external_id || item.price.id;
  if (priceId !== PRACTICE_PRICE) throw new Error('Unsupported subscription plan.');
  const { data: previous, error: readError } = await supabaseAdmin.from('subscriptions').select('past_due_since').eq('stripe_subscription_id', id).eq('environment', env).maybeSingle();
  if (readError) throw readError;
  // Use the first failed invoice timestamp, not webhook arrival, to prevent extending the grace period.
  let pastDueSince = previous?.past_due_since ?? null;
  if (sub.status === 'past_due' && !pastDueSince) {
    const invoiceId = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice?.id;
    const invoice = invoiceId ? await stripe.invoices.retrieve(invoiceId) : null;
    pastDueSince = new Date((invoice?.status_transitions.finalized_at ?? invoice?.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
  }
  const { error } = await supabaseAdmin.from('subscriptions').upsert({
    user_id: userId, stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    price_id: priceId, status: sub.status,
    current_period_end: item.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    past_due_since: sub.status === 'past_due' ? pastDueSince : null,
    environment: env, updated_at: new Date().toISOString(),
  }, { onConflict: 'environment,stripe_subscription_id' });
  if (error) throw error;
  return sub;
}