import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { TokenAction } from '@/components/employers/TokenAction';
import { employerHead } from '@/components/employers/Fields';
import { leaveWaitlistFn } from '@/lib/employer.functions';

export const Route = createFileRoute('/employers_/leave')({
  validateSearch: (s: Record<string, unknown>): { token?: string } => ({ token: typeof s.token === 'string' ? s.token : undefined }),
  head: () => employerHead('Leave the employer waitlist', 'Remove yourself from the RoleProve employer waitlist.', false),
  component: Page,
});
function Page() {
  const { token } = Route.useSearch(); const leave = useServerFn(leaveWaitlistFn);
  return <TokenAction token={token} title="Remove me from the waitlist" intro="This deletes your entry from the RoleProve employer waitlist." button="Remove me"
    run={t => leave({ data: { token: t } })} success="You've been removed. Your waitlist details have been deleted." failure="Could not remove you. Please email support@roleprove.com." />;
}
