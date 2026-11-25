import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { employerHead } from "@/components/employers/Fields";
import { EmployerPreview } from "@/components/application/EmployerPreview";
import { applicationCvLinkFn, openApplicationFn, setApplicationStatusFn } from "@/lib/applications.functions";
import { APPLY_NOTICE, EMPLOYER_STATUSES, STATUS_LABELS } from "@/lib/applications";

export const Route = createFileRoute("/_authenticated/employer/application/$applicationId")({
  head: () => employerHead("Application", "One application, shown exactly as the candidate shared it.", false),
  component: ApplicationView,
});

function ApplicationView() {
  const { applicationId } = Route.useParams();
  const qc = useQueryClient();
  const openFn = useServerFn(openApplicationFn), cvFn = useServerFn(applicationCvLinkFn), statusFn = useServerFn(setApplicationStatusFn);
  const q = useQuery({ queryKey: ["application", applicationId], queryFn: () => openFn({ data: { id: applicationId } }), staleTime: Infinity, retry: false });
  const [cv, setCv] = useState<{ url: string; fileName: string; pdf: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!q.data) return <p className="py-10 text-muted-foreground">Loading…</p>;
  const d = q.data;
  if ("error" in d) return <div className="py-10"><p>{d.error}</p><Button asChild variant="outline" className="mt-4"><Link to="/employer/jobs">Company jobs</Link></Button></div>;
  const back = d.jobId ? <Link to="/employer/applicants/$jobId" params={{ jobId: d.jobId }} className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Applicants</Link> : null;
  if (d.withdrawn || !d.view) return <div>{back}<p className="mt-6 text-lg">{d.withdrawn ? "Withdrawn by candidate" : "This application is no longer available."}</p></div>;
  async function openCv() {
    const r = await cvFn({ data: { id: applicationId } });
    if ("error" in r) toast.error(r.error); else setCv(r);
  }
  async function setStatus(status: (typeof EMPLOYER_STATUSES)[number]) {
    setBusy(true);
    try { const r = await statusFn({ data: { id: applicationId, status } }); if ("error" in r) toast.error(r.error); else { toast.success(`Status set to ${STATUS_LABELS[status]}.`); qc.setQueryData(["application", applicationId], { ...d, status }); await qc.invalidateQueries({ queryKey: ["applicants"] }); } } finally { setBusy(false); }
  }
  return <div>{back}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-3xl font-semibold">{d.view.name}</h1><p className="text-muted-foreground">{d.jobTitle} · applied {new Date(d.created_at).toLocaleDateString()}</p></div><Badge>{STATUS_LABELS[d.status]}</Badge></div>
    {d.canChange && <div className="mt-5 flex flex-wrap gap-2">{EMPLOYER_STATUSES.map((s) => <Button key={s} size="sm" variant={d.status === s ? "default" : "outline"} disabled={busy || d.status === s} onClick={() => void setStatus(s)}>{STATUS_LABELS[s]}</Button>)}</div>}
    <p className="mt-4 text-sm text-muted-foreground">{APPLY_NOTICE}</p>
    {d.coverNote && <section className="mt-6"><h2 className="font-medium">Cover note</h2><p className="mt-2 whitespace-pre-wrap rounded-lg border border-border p-4 text-sm">{d.coverNote}</p></section>}
    <div className="mt-6"><EmployerPreview view={d.view} photo={d.photo} /></div>
    {d.hasCv && <Button variant="outline" className="mt-4" onClick={() => void openCv()}><FileText className="mr-2 h-4 w-4" />View CV</Button>}
    <Dialog open={!!cv} onOpenChange={(o) => !o && setCv(null)}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{cv?.fileName}</DialogTitle></DialogHeader>
      {cv && (cv.pdf ? <iframe title="CV viewer" src={`${cv.url}#toolbar=0`} className="h-[75vh] w-full rounded border border-border" /> : <DocxText url={cv.url} />)}
      <p className="text-xs text-muted-foreground">This viewing link expires in 5 minutes. Close and reopen to view again.</p>
    </DialogContent></Dialog>
  </div>;
}

/** Word CVs are read in the browser as plain text; the file never goes to another service. */
function DocxText({ url }: { url: string }) {
  const q = useQuery({ queryKey: ["cv-text", url], staleTime: Infinity, queryFn: async () => { const buf = await (await fetch(url)).arrayBuffer(); const mammoth = await import("mammoth"); return (await mammoth.extractRawText({ arrayBuffer: buf })).value; } });
  return <div className="h-[75vh] overflow-y-auto whitespace-pre-wrap rounded border border-border p-4 text-sm">{q.isError ? "This CV could not be shown." : q.data ?? "Loading…"}</div>;
}
