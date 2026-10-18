import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBilling } from '@/hooks/useBilling';
import { Button } from '@/components/ui/button';
import { createPortalSession } from '@/lib/payments.functions';
import { getStripeEnvironment } from '@/lib/stripe';

export function BillingStatus({ detailed = false }: { detailed?: boolean }) {
  const query = useBilling();
  const [busy, setBusy] = useState(false);
  const access = query.data;
  async function manage() {
    setBusy(true);
    // Open synchronously to avoid popup blockers; do not expose the preview origin to the hosted portal.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const result = await createPortalSession({ data: { environment: getStripeEnvironment(), origin: window.location.origin } });
      if ('error' in result) throw new Error(result.error);
      if (tab) tab.location.href = result.url;
      else toast.error('Please allow a new tab to open billing.');
    } catch (error) { tab?.close(); toast.error(error instanceof Error ? error.message : 'Could not open billing'); }
    finally { setBusy(false); }
  }
  if (query.isPending) return <p className="text-sm text-muted-foreground">Loading plan…</p>;
  if (!access) return <p role="alert" className="text-sm text-destructive">{query.error?.message ?? 'Could not load your plan.'}</p>;
  const title = access.paid ? 'Practice/Prep' : !access.enforced ? 'Launch access' : access.trialActive ? `Free trial · ${access.trialDaysLeft} days left` : 'Free';
  return <section aria-label="Your plan" className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-5">
    <div className="space-y-1">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><CreditCard className="h-4 w-4" />{title}</h2>
      <p className="text-sm text-muted-foreground">{access.paid ? '$15 USD / month · unlimited practice' : !access.enforced ? 'Unlimited practice while launch access is open.' : access.trialActive ? 'Unlimited practice · no card required' : `${access.simulationsLeft} simulations · ${access.interviewPrepLeft} interview prep session${access.interviewPrepLeft === 1 ? '' : 's'} remaining`}</p>
      {access.cancelAtPeriodEnd && access.periodEnd && <p className="text-sm text-muted-foreground">Cancelled · access until {new Date(access.periodEnd).toLocaleDateString()}</p>}
      {access.subscriptionStatus === 'past_due' && <p className="text-sm text-destructive">Payment failed. Update your payment method within 7 days to keep access.</p>}
      {access.trialActive && access.trialDaysLeft <= 5 && <p className="text-sm text-primary">Your trial ends soon. Keep practising with Practice/Prep.</p>}
      {detailed && <p className="text-xs text-muted-foreground">Career+ · Coming soon</p>}
    </div>
    {access.subscriptionStatus !== 'none' ? <Button variant="outline" onClick={manage} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Manage billing</Button> : <Button asChild variant="outline"><Link to="/subscribe">View Practice/Prep</Link></Button>}
  </section>;
}