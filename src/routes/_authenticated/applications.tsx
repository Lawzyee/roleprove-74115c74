import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmployerPreview } from "@/components/application/EmployerPreview";
import { getMyApplicationsFn, withdrawApplicationFn } from "@/lib/applications.functions";
import { ACTIVE_STATUSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/applications";
import type { ShareView } from "@/lib/application-profile";

const TITLE = "My applications | RoleProve";
const DESC = "Jobs you applied to with RoleProve, their status and what you shared.";
export const Route = createFileRoute("/_authenticated/applications")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: MyApplications,
});
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "");

function MyApplications() {
  const qc = useQueryClient();
  const listFn = useServerFn(getMyApplicationsFn), withdrawFn = useServerFn(withdrawApplicationFn);
  const q = useQuery({ queryKey: ["my-applications"], queryFn: () => listFn() });
  const [shown, setShown] = useState<ShareView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function withdraw(id: string) {
    if (!window.confirm("Withdraw this application? The employer loses access straight away.")) return;
    setBusy(id);
    try { const r = await withdrawFn({ data: { id } }); if ("error" in r) toast.error(r.error); else { toast.success("Application withdrawn."); await qc.invalidateQueries({ queryKey: ["my-applications"] }); } } finally { setBusy(null); }
  }
  return <><SiteHeader /><main className="mx-auto max-w-4xl px-5 py-9">
    <h1 className="font-display text-3xl font-semibold">My applications</h1>
    <p className="mt-2 text-sm text-muted-foreground">Applications you sent with RoleProve. The employer decides about hiring, not RoleProve.</p>
    {!q.data ? <p className="py-10 text-muted-foreground">Loading…</p> : !q.data.length ? <p className="py-10 text-muted-foreground">No applications yet. Look for "Apply with RoleProve" in the <Link to="/jobs" className="text-primary underline">Job center</Link>.</p> :
      <ul className="mt-6 divide-y divide-border">{q.data.map((a) => { const st = a.status as ApplicationStatus; return <li key={a.id} className="flex flex-wrap items-start justify-between gap-4 py-5">
        <div className="min-w-0"><h2 className="font-display text-lg font-semibold">{a.job_title}</h2><p className="text-muted-foreground">{a.company_name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm"><Badge variant={st === "shortlisted" || st === "interview" ? "default" : "outline"}>{STATUS_LABELS[st]}</Badge><span>Applied {day(a.created_at)}</span>{a.viewed_at && <span>Viewed {day(a.viewed_at)}</span>}{a.withdrawn_at && <span>Withdrawn {day(a.withdrawn_at)}</span>}</div>
          {a.purged_at && <p className="mt-2 text-xs text-muted-foreground">What you shared has been deleted.</p>}</div>
        <div className="flex flex-wrap gap-2">{a.shared && <Button variant="outline" size="sm" onClick={() => setShown(a.shared as ShareView)}>What I shared</Button>}{ACTIVE_STATUSES.includes(st) && <Button variant="ghost" size="sm" disabled={busy === a.id} onClick={() => void withdraw(a.id)}>Withdraw application</Button>}</div>
      </li>; })}</ul>}
    <Dialog open={!!shown} onOpenChange={(o) => !o && setShown(null)}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>What I shared</DialogTitle></DialogHeader>{shown && <EmployerPreview view={shown} photo={null} />}</DialogContent></Dialog>
  </main></>;
}
