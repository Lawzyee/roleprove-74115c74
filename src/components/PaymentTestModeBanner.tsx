export function PaymentTestModeBanner() {
  const token = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;
  if (token?.startsWith('pk_live_')) return null;
  return <div role="status" className="w-full border-b border-border bg-muted px-4 py-2 text-center text-sm text-muted-foreground">
    {token?.startsWith('pk_test_') ? 'Test payments only — no real money is charged.' : 'Production checkout is not configured. Complete Stripe go-live in Lovable to accept real payments.'}
  </div>;
}