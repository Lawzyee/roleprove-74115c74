import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { employerHead } from "@/components/employers/Fields";
import { getApplicantsFn } from "@/lib/applications.functions";
import { NO_RANKING_NOTICE, STATUS_LABELS } from "@/lib/applications";

export const Route = createFileRoute("/_authenticated/employer/applicants/$jobId")({
  head: () => employerHead("Applicants", "Applications to one of your company's jobs.", false),
  component: Applicants,
});

function Applicants() {
  const { jobId } = Route.useParams();
  const fn = useServerFn(getApplicantsFn);
  const q = useQuery({ queryKey: ["applicants", jobId], queryFn: () => fn({ data: { jobId } }) });
  if (q.error) return <p className="py-10">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="py-10 text-muted-foreground">Loading…</p>;
  return <div>
    <Link to="/employer/jobs" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Company jobs</Link>
    <h1 className="mt-5 font-display text-3xl font-semibold">Applicants</h1><p className="mt-1 text-lg">{q.data.jobTitle}</p>
    <p className="mt-3 text-sm text-muted-foreground">{NO_RANKING_NOTICE} Applicants are shown in the app only; there is no download or export.</p>
    {!q.data.rows.length ? <p className="py-10 text-muted-foreground">No applications yet.</p> :
      <ul className="mt-6 divide-y divide-border">{q.data.rows.map((r) => <li key={r.id}>
        {r.status === "withdrawn" || r.name === "No longer available" ? <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-muted-foreground"><span>{r.name}</span><span className="text-sm">{new Date(r.created_at).toLocaleDateString()}</span></div> :
        <Link to="/employer/application/$applicationId" params={{ applicationId: r.id }} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-muted/50">
          <div><p className="font-medium">{r.name}</p>{r.target && <p className="mt-1 text-sm"><Badge variant="outline" className="mr-2">{r.target.badge}</Badge>{r.target.score}/100 <span className="text-xs text-muted-foreground">· {r.target.wording}</span></p>}</div>
          <div className="flex items-center gap-3 text-sm"><Badge variant={r.status === "submitted" ? "default" : "secondary"}>{STATUS_LABELS[r.status]}</Badge><span>{new Date(r.created_at).toLocaleDateString()}</span></div>
        </Link>}
      </li>)}</ul>}
  </div>;
}
