import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getEmployerStateFn } from '@/lib/employer-accounts.functions';

export function useEmployerState() {
  const fn = useServerFn(getEmployerStateFn);
  return useQuery({ queryKey: ['employer-state'], queryFn: () => fn() });
}
