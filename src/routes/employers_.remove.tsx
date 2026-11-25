import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { TokenAction } from '@/components/employers/TokenAction';
import { employerHead } from '@/components/employers/Fields';
import { removeListingFn } from '@/lib/employer.functions';

export const Route = createFileRoute('/employers_/remove')({
  validateSearch: (s: Record<string, unknown>): { token?: string } => ({ token: typeof s.token === 'string' ? s.token : undefined }),
  head: () => employerHead('Remove a job listing', 'Take your job listing off RoleProve.', false),
  component: Page,
});
function Page() {
  const { token } = Route.useSearch(); const remove = useServerFn(removeListingFn);
  return <TokenAction token={token} title="Remove this listing" intro="Press the button to take your job listing off RoleProve straight away." button="Remove this listing"
    run={t => remove({ data: { token: t } })} success="Your listing has been removed and no longer appears in the Job center." failure="Could not remove the listing. Please email support@roleprove.com." />;
}
