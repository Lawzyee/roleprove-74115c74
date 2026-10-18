import { loadStripe, type Stripe } from '@stripe/stripe-js';
const token = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;
export function getStripeEnvironment(): 'sandbox' | 'live' {
  if (token?.startsWith('pk_test_')) return 'sandbox';
  if (token?.startsWith('pk_live_')) return 'live';
  throw new Error('Payments are not configured. Complete Stripe go-live in Lovable to enable production checkout.');
}
let promise: Promise<Stripe | null> | null = null;
export function getStripe() {
  getStripeEnvironment();
  if (!token) throw new Error('Payments are not configured.');
  promise ??= loadStripe(token);
  return promise;
}