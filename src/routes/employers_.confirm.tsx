import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { TokenAction } from '@/components/employers/TokenAction';
import { employerHead } from '@/components/employers/Fields';
import { confirmWaitlistFn } from '@/lib/employer.functions';

export const Route = createFileRoute('/employers_/confirm')({
  validateSearch: (s: Record<string, unknown>): { token?: string } => ({ token: typeof s.token === 'string' ? s.token : undefined }),
  head: () => employerHead('Confirm your waitlist place', 'Confirm your place on the RoleProve employer waitlist.', false),
  component: Page,
});
function Page() {
  const { token } = Route.useSearch(); const confirm = useServerFn(confirmWaitlistFn);
  return <TokenAction token={token} auto title="Employer waitlist" intro="Confirming your place…" button="Confirm"
    run={t => confirm({ data: { token: t } })} success="You're confirmed on the RoleProve employer waitlist. We'll be in touch about employer features."
    failure="This link has already been used or has expired. If you've already confirmed, you're on the list." />;
}
