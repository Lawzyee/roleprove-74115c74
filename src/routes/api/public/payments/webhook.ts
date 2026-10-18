import { createFileRoute } from '@tanstack/react-router';
import { verifyWebhook } from '@/lib/stripe.server';
import { syncSubscription } from '@/lib/billing.server';

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
      if (id) await syncSubscription(id, env);
      return Response.json({ received: true });
    } catch { return new Response('Payment update failed; please retry', { status: 500 }); }
  } } },
});