import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { Check, ArrowLeft } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
import { StripeEmbeddedCheckout } from '@/components/StripeEmbeddedCheckout';
import { BillingStatus } from '@/components/BillingStatus';
import { Button } from '@/components/ui/button';
import { useBilling } from '@/hooks/useBilling';
import { getStripeEnvironment } from '@/lib/stripe';

export const Route = createFileRoute('/_authenticated/subscribe')({
  head: () => ({ meta: [
    { title: 'Practice/Prep subscription | RoleProve' },
    { name: 'description', content: 'Subscribe to unlimited RoleProve simulations and interview practice for $15 USD per month.' },
    { property: 'og:title', content: 'Practice/Prep subscription | RoleProve' },
    { property: 'og:description', content: 'Unlimited job simulations, interview preparation and verified attempts.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }), component: SubscribePage,
});
function SubscribePage() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const billing = useBilling();
  const fail = useCallback((message: string) => { setError(message); setOpen(false); }, []);
  function checkout() {
    try { getStripeEnvironment(); setError(null); setOpen(true); }
    catch (error) { fail(error instanceof Error ? error.message : 'Payments are not configured.'); }
  }
  return <><PaymentTestModeBanner /><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-10">
    <Button asChild variant="ghost" size="sm"><Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Dashboard</Link></Button>
    <h1 className="mt-6 font-display text-3xl font-semibold">Practice/Prep</h1>
    {billing.data?.enforced && !billing.data.paid && !billing.data.trialActive && <p className="mt-2 text-primary">Subscribe to continue</p>}
    <p className="mt-3 font-display text-4xl font-semibold">$15 <span className="font-sans text-base font-normal text-muted-foreground">USD / month</span></p>
    <ul className="my-7 space-y-3">{['Unlimited generic and job-description simulations', 'Unlimited interview preparation', 'Verified attempts with private recordings'].map((item) => <li key={item} className="flex items-center gap-3 text-sm"><Check className="h-4 w-4 shrink-0 text-primary" />{item}</li>)}</ul>
    <p className="mb-6 text-sm text-muted-foreground">Cancel anytime. Your access continues until the paid period ends.</p>
    {billing.data?.paid || (billing.data && billing.data.subscriptionStatus !== 'none') ? <BillingStatus detailed /> : <>
      {!billing.data?.enforced && <p className="mb-4 text-sm text-muted-foreground">Launch access is currently open. A subscription is optional.</p>}
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {open ? <section aria-label="Payment checkout"><StripeEmbeddedCheckout onError={fail} /></section> : <Button onClick={checkout}>Subscribe to Practice/Prep</Button>}
    </>}
    <p className="mt-10 border-t border-border pt-5 text-sm text-muted-foreground">Career+ · Coming soon</p>
  </main></>;
}