import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { isInternalPath, PAGE_SIZE } from "@/lib/notifications";
import { useInboxPage, type InboxItem } from "@/components/inbox/inbox-data";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [
    { title: "Inbox — RoleProve" },
    { name: "description", content: "Your RoleProve notifications: support replies, saved jobs and account notices." },
    { property: "og:title", content: "Inbox — RoleProve" },
    { property: "og:description", content: "Your RoleProve notifications." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: InboxPage,
});

function InboxPage() {
  const [page, setPage] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useInboxPage(page, unreadOnly);
  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));
  const refresh = () => qc.invalidateQueries({ queryKey: ["inbox"] });

  async function run(p: PromiseLike<{ error: unknown }>, fail: string) {
    const { error } = await p;
    if (error) toast.error(fail);
    await refresh();
  }
  const now = () => new Date().toISOString();
  async function open(n: InboxItem) {
    if (!n.read_at) await supabase.from("notifications").update({ read_at: now() }).eq("id", n.id);
    await refresh();
    if (isInternalPath(n.link)) navigate({ href: n.link });
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-5">
        <h1 className="font-display text-2xl font-semibold">Inbox</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter notifications" className="flex rounded-lg border border-border p-0.5">
            {[["All", false], ["Unread", true]].map(([label, val]) => (
              <button key={String(label)} type="button" aria-pressed={unreadOnly === val}
                onClick={() => { setUnreadOnly(val as boolean); setPage(0); }}
                className={`rounded-md px-3 py-1.5 text-sm ${unreadOnly === val ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
                {label as string}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => run(supabase.from("notifications").update({ read_at: now() }).is("read_at", null), "Could not mark as read.")}>Mark all as read</Button>
            <Button size="sm" variant="outline" onClick={() => run(supabase.from("notifications").delete().not("read_at", "is", null), "Could not delete.")}>Delete all read</Button>
          </div>
        </div>

        {isLoading ? <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
          : isError ? <p role="alert" className="mt-8 text-sm text-destructive">Could not load your inbox.</p>
          : items.length === 0 ? <p className="mt-8 text-sm text-muted-foreground">{unreadOnly ? "No unread notifications." : "Your inbox is empty."}</p>
          : (
            <ul className="mt-6 divide-y divide-border rounded-xl border border-border" aria-label="Notifications">
              {items.map((n) => (
                <li key={n.id} className={`flex items-start gap-2 p-3 sm:p-4 ${n.read_at ? "" : "bg-accent/60"}`}>
                  <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="flex items-center gap-2">
                      {!n.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                      <span className={`truncate text-sm ${n.read_at ? "" : "font-semibold"}`}>{n.title}</span>
                      {!n.read_at && <span className="sr-only">(unread)</span>}
                    </span>
                    {n.body && <span className="mt-1 block text-sm text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 block text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                  </button>
                  <Button size="icon" variant="ghost" aria-label={`Delete notification: ${n.title}`}
                    onClick={() => run(supabase.from("notifications").delete().eq("id", n.id), "Could not delete.")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

        {pages > 1 && (
          <nav aria-label="Inbox pages" className="mt-4 flex items-center justify-between text-sm">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
            <span>Page {page + 1} of {pages}</span>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Older</Button>
          </nav>
        )}
      </main>
    </div>
  );
}
