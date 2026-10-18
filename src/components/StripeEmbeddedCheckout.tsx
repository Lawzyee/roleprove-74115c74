import { useCallback } from 'react';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { createCheckoutSession } from '@/lib/payments.functions';
import { getStripe, getStripeEnvironment } from '@/lib/stripe';

export function StripeEmbeddedCheckout({ onError }: { onError: (message: string) => void }) {
  const fetchClientSecret = useCallback(async () => {
    try {
      const result = await createCheckoutSession({ data: { environment: getStripeEnvironment(), origin: window.location.origin } });
      if ('error' in result) throw new Error(result.error);
      return result.clientSecret;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load checkout.';
      onError(message);
      throw error;
    }
  }, [onError]);
  return <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}><EmbeddedCheckout /></EmbeddedCheckoutProvider>;
}