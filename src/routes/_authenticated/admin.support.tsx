import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SiteHeader } from '@/components/SiteHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/support/SupportParts';
import { TicketThread } from '@/components/support/TicketThread';
import { categoryLabel, SUPPORT_CATEGORIES } from '@/lib/support';
import { getDisputeAttemptFn, getIsSupportStaffFn } from '@/lib/support.functions';

type Search = { status?: string; category?: string; ticket?: string };
export const Route = createFileRoute('/_authenticated/admin/support')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    status: typeof s.status === 'string' ? s.status : undefined,
    category: typeof s.category === 'string' ? s.category : undefined,
    ticket: typeof s.ticket === 'string' ? s.ticket : undefined,
  }),
  head: () => ({ meta: [
    { title: 'Support inbox | RoleProve' },
    { name: 'description', content: 'Staff-only support ticket management for RoleProve.' },
    { property: 'og:title', content: 'Support inbox | RoleProve' },
    { property: 'og:description', content: 'Staff-only support ticket management.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: AdminSupport,
});

function AdminSupport() {
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const staff = useQuery({ queryKey: ['is-staff'], queryFn: () => getIsSupportStaffFn() });
  const tickets = useQuery({
    queryKey: ['admin-tickets', search.status, search.category], enabled: staff.data?.staff === true,
    queryFn: async () => {
      let q = supabase.from('support_tickets').select('id, subject, category, status, tags, updated_at, staff_last_read_at, support_messages(sender, created_at)').order('updated_at', { ascending: false }).limit(200);
      if (search.status) q = q.eq('status', search.status);
      if (search.category) q = q.eq('category', search.category);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  if (staff.isPending) return <><SiteHeader /><main className="mx-auto max-w-6xl px-5 py-10 text-sm text-muted-foreground">Checking access…</main></>;
  if (!staff.data?.staff) return <><SiteHeader /><main className="mx-auto max-w-6xl px-5 py-10"><h1 className="font-display text-2xl font-semibold">Not available</h1><p className="mt-2 text-muted-foreground">This page is for RoleProve support staff only.</p></main></>;
  const set = (patch: Search) => nav({ search: (prev) => ({ ...prev, ...patch }) });
  return <><SiteHeader /><main className="mx-auto grid max-w-6xl gap-6 px-5 py-10 lg:grid-cols-[22rem_1fr]">
    <aside>
      <h1 className="font-display text-2xl font-semibold">Support inbox</h1>
      <div className="mt-4 flex gap-2">
        <Select value={search.status ?? 'all'} onValueChange={(v) => set({ status: v === 'all' ? undefined : v })}><SelectTrigger aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="replied">Replied</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectContent></Select>
        <Select value={search.category ?? 'all'} onValueChange={(v) => set({ category: v === 'all' ? undefined : v })}><SelectTrigger aria-label="Category filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All categories</SelectItem>{SUPPORT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select>
      </div>
      <ul className="mt-4 divide-y divide-border rounded-lg border border-border">{tickets.data?.map((t) => {
        const unread = (t.support_messages ?? []).some((m) => m.sender === 'user' && (!t.staff_last_read_at || m.created_at > t.staff_last_read_at));
        return <li key={t.id}><Link to="/admin/support" search={{ ...search, ticket: t.id }} className={`block p-3 hover:bg-accent ${search.ticket === t.id ? 'bg-accent' : ''}`}>
          <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-medium">{unread && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary" />}{t.subject}</p><StatusBadge status={t.status} /></div>
          <p className="text-xs text-muted-foreground">{categoryLabel(t.category)}{t.tags.includes('legal_deadline') ? ' · Legal deadline' : ''} · {new Date(t.updated_at).toLocaleDateString()}</p>
        </Link></li>;
      })}{tickets.data?.length === 0 && <li className="p-3 text-sm text-muted-foreground">No tickets.</li>}</ul>
    </aside>
    <section>{search.ticket ? <><TicketThread key={search.ticket} ticketId={search.ticket} staff /><DisputePanel ticketId={search.ticket} /></> : <p className="text-muted-foreground">Select a ticket.</p>}</section>
  </main></>;
}

type Criterion = { criterion?: string; name?: string; score?: number | null; justification?: string };
function DisputePanel({ ticketId }: { ticketId: string }) {
  const q = useQuery({ queryKey: ['dispute-attempt', ticketId], queryFn: () => getDisputeAttemptFn({ data: { ticketId } }) });
  if (!q.data || !('payload' in q.data) || !q.data.payload) return null;
  const parsed = JSON.parse(q.data.payload) as { attempt: unknown; results: Record<string, unknown>[] };
  const a = parsed.attempt as { overall_score: number | null; status: string; simulations?: { title?: string } | null };
  const results = [...parsed.results].sort((x, y) => Number((x.simulation_tasks as { order?: number } | null)?.order ?? 0) - Number((y.simulation_tasks as { order?: number } | null)?.order ?? 0));
  return <section aria-label="Disputed attempt" className="mt-8 rounded-lg border border-border p-5">
    <h2 className="font-display text-lg font-semibold">Disputed attempt</h2>
    <p className="text-sm text-muted-foreground">{a.simulations?.title} · {a.status} · Overall {a.overall_score ?? '—'}/100</p>
    <ul className="mt-4 space-y-4">{results.map((r) => <li key={String(r.id)} className="text-sm">
      <p className="font-medium">{(r.simulation_tasks as { title?: string } | null)?.title} — {String(r.score ?? '—')}/{String(r.max_score)}</p>
      {typeof r.feedback === 'string' && <p className="text-muted-foreground">{r.feedback}</p>}
      {Array.isArray(r.criteria_breakdown) && <ul className="ml-4 mt-1 list-disc text-muted-foreground">{(r.criteria_breakdown as Criterion[]).map((c, i) => <li key={i}>{c.criterion ?? c.name}: {c.score ?? 'Cannot evaluate'}{c.justification ? ` — ${c.justification}` : ''}</li>)}</ul>}
    </li>)}</ul>
  </section>;
}
