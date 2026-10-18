import { createFileRoute } from '@tanstack/react-router';
import { verifyWebhook } from '@/lib/stripe.server';
import { syncSubscription, sendBillingEmail } from '@/lib/billing.server';

export const Route = createFileRoute('/api/public/payments/webhook')({
  server: { handlers: { POST: async ({ request }) => {
    const env = new URL(request.url).searchParams.get('env');
    if (env !== 'sandbox' && env !== 'live') return new Response('Invalid environment', { status: 400 });
    let event;
    try { event = await verifyWebhook(request, env); }
    catch { return new Response('Invalid signature', { status: 400 }); }
    try {
      const object = event.data.object as unknown as { id: string; subscription?: string; parent?: { subscription_details?: { subscription?: string } } };
      let id: string | undefined;
      if (event.type.startsWith('customer.subscription.')) id = object.id;
      else if (['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed'].includes(event.type)) id = object.subscription;
      else if (['invoice.paid', 'invoice.payment_failed'].includes(event.type)) id = object.parent?.subscription_details?.subscription ?? object.subscription;
      if (id) {
        const sub = await syncSubscription(id, env);
        const e = event as unknown as { id: string; data: { object: Record<string, any>; previous_attributes?: Record<string, any> } };
        const obj = e.data.object;
        let kind: 'started' | 'payment_failed' | 'cancelled' | null = null;
        if (event.type === 'invoice.paid' && obj.billing_reason === 'subscription_create') kind = 'started';
        else if (event.type === 'invoice.payment_failed') kind = 'payment_failed';
        else if (event.type === 'customer.subscription.updated' && obj.cancel_at_period_end === true && e.data.previous_attributes?.cancel_at_period_end === false) kind = 'cancelled';
        else if (event.type === 'customer.subscription.deleted' && !obj.cancel_at_period_end) kind = 'cancelled';
        // Email failures must not make Stripe retry the (already applied) subscription update.
        if (kind) await sendBillingEmail(sub, kind, e.id).catch((err) => console.error('Billing email failed', err));
      }
      return Response.json({ received: true });
    } catch { return new Response('Payment update failed; please retry', { status: 500 }); }
  } } },
});