import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { getBillingAccessFn } from '@/lib/payments.functions';
import { getStripeEnvironment } from '@/lib/stripe';

export function useBilling() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['billing', user?.id], enabled: Boolean(user), staleTime: 10000,
    queryFn: () => getBillingAccessFn({ data: { environment: getStripeEnvironment() } }),
    refetchOnWindowFocus: true,
  });
}