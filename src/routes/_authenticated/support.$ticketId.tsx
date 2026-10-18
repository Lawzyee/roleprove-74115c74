import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';
import { TicketThread } from '@/components/support/TicketThread';

export const Route = createFileRoute('/_authenticated/support/$ticketId')({
  head: () => ({ meta: [
    { title: 'Support ticket | RoleProve' },
    { name: 'description', content: 'Read and reply to your RoleProve support ticket.' },
    { property: 'og:title', content: 'Support ticket | RoleProve' },
    { property: 'og:description', content: 'A RoleProve support conversation.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: TicketPage,
});

function TicketPage() {
  const { ticketId } = Route.useParams();
  return <><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-10">
    <Button asChild variant="ghost" size="sm" className="mb-4"><Link to="/support"><ArrowLeft className="mr-2 h-4 w-4" />My tickets</Link></Button>
    <TicketThread ticketId={ticketId} />
  </main></>;
}
