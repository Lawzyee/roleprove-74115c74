import { createFileRoute, Link } from '@tanstack/react-router';
import { SiteHeader } from '@/components/SiteHeader';
import { Button } from '@/components/ui/button';
import { StatusBadge, useMyTickets } from '@/components/support/SupportParts';
import { categoryLabel } from '@/lib/support';

export const Route = createFileRoute('/_authenticated/support/')({
  head: () => ({ meta: [
    { title: 'My support tickets | RoleProve' },
    { name: 'description', content: 'View and reply to your RoleProve support tickets.' },
    { property: 'og:title', content: 'My support tickets | RoleProve' },
    { property: 'og:description', content: 'Your RoleProve support conversations.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: MyTickets,
});

function MyTickets() {
  const tickets = useMyTickets();
  return <><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-10">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-3xl font-semibold">My support tickets</h1>
      <Button asChild><Link to="/support/new">New ticket</Link></Button>
    </div>
    {tickets.isPending ? <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      : tickets.error ? <p role="alert" className="mt-6 text-sm text-destructive">Could not load your tickets.</p>
      : !tickets.data?.length ? <p className="mt-6 text-muted-foreground">No tickets yet. Check the <Link to="/help" className="text-primary underline">Help centre</Link> or open a new ticket.</p>
      : <ul className="mt-6 divide-y divide-border rounded-lg border border-border">{tickets.data.map((t) => <li key={t.id}>
        <Link to="/support/$ticketId" params={{ ticketId: t.id }} className="flex items-center justify-between gap-3 p-4 hover:bg-accent">
          <div className="min-w-0"><p className="truncate font-medium">{t.unread && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary" aria-label="New reply" />}{t.subject}</p>
            <p className="text-xs text-muted-foreground">{categoryLabel(t.category)} · {new Date(t.created_at).toLocaleDateString()}</p></div>
          <StatusBadge status={t.status} />
        </Link></li>)}</ul>}
  </main></>;
}
