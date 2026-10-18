import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { confirmCheckout } from '@/lib/payments.functions';
import { getStripeEnvironment } from '@/lib/stripe';
import { SiteHeader } from '@/components/SiteHeader';
import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
import { Button } from '@/components/ui/button';
export const Route = createFileRoute('/_authenticated/checkout/return')({
  validateSearch: (search: Record<string, unknown>) => ({ session_id: typeof search.session_id === 'string' && /^cs_[a-zA-Z0-9_]+$/.test(search.session_id) ? search.session_id : undefined }),
  head: () => ({ meta: [
    { title: 'Subscription confirmation | RoleProve' }, { name: 'description', content: 'Check your RoleProve subscription payment and practice access.' },
    { property: 'og:title', content: 'Subscription confirmation | RoleProve' }, { property: 'og:description', content: 'Your Practice/Prep payment confirmation.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }), component: ReturnPage,
});
function ReturnPage() {
  const { session_id: sessionId } = Route.useSearch();
  const query = useQuery({ queryKey: ['checkout-confirm', sessionId], enabled: Boolean(sessionId), queryFn: async () => {
    if (!sessionId) throw new Error('No checkout information found.');
    const result = await confirmCheckout({ data: { sessionId, environment: getStripeEnvironment() } });
    if ('error' in result) throw new Error(result.error);
    return result;
  }, refetchInterval: (q) => q.state.data?.state === 'pending' ? 5000 : false });
  return <><PaymentTestModeBanner /><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-10">
    <h1 className="font-display text-3xl font-semibold">{query.data?.state === 'paid' ? 'You’re subscribed' : 'Subscription confirmation'}</h1>
    <p className="my-5 text-muted-foreground">{!sessionId ? 'No checkout information found.' : query.error ? query.error.message : query.isPending ? 'Checking your payment…' : query.data?.state === 'paid' ? 'Practice/Prep is active. Enjoy unlimited practice.' : 'Your payment is still processing. Access starts when payment is confirmed.'}</p>
    <Button asChild><Link to="/dashboard">Back to dashboard</Link></Button>
    {query.error && <Button className="ml-3" variant="outline" onClick={() => query.refetch()}>Check again</Button>}
  </main></>;
}