import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DataTables, ProjectHeader } from "@/components/portfolio/PublicView";
import { INSIGHT_MAX, PRACTICE_DISCLAIMER, VERIFIED_MEANING, type StageVisibility } from "@/lib/portfolio";
import { getMyProjectFn, regenerateInsightFn, updateProjectFn } from "@/lib/portfolio.functions";

export const Route = createFileRoute("/_authenticated/portfolio/$projectId")({
  head: () => ({
    meta: [
      { title: "Edit portfolio project | RoleProve" },
      { name: "description", content: "Edit the insight and choose which stages of this project appear on your portfolio." },
      { property: "og:title", content: "Edit portfolio project | RoleProve" },
      { property: "og:description", content: "Edit the insight and choose which stages of this project appear on your portfolio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwnerProjectPage,
});

function OwnerProjectPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const get = useServerFn(getMyProjectFn);
  const update = useServerFn(updateProjectFn);
  const regen = useServerFn(regenerateInsightFn);
  const q = useQuery({ queryKey: ["my-portfolio-project", projectId], queryFn: () => get({ data: { projectId } }) });
  const [insight, setInsight] = useState("");
  const [vis, setVis] = useState<Record<string, StageVisibility>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data?.found) {
      setInsight(q.data.project.insight);
      setVis(Object.fromEntries((q.data.project.stages as unknown as Array<{ taskId: string; visibility: StageVisibility }>).map((s) => [s.taskId, s.visibility])));
    }
  }, [q.data]);

  if (q.isLoading) return <Shell><p className="text-sm text-muted-foreground">Loading…</p></Shell>;
  if (!q.data?.found) return <Shell><p>This project isn’t in your portfolio.</p><Button asChild variant="outline" className="mt-3"><Link to="/portfolio">Back to portfolio</Link></Button></Shell>;
  const { generationsLeft, showScores } = q.data;
  const project = q.data.project as typeof q.data.project & { stages: Array<typeof q.data.project.stages[number] & { taskId: string; visibility: StageVisibility }> };

  async function save() {
    setBusy(true);
    const r = await update({ data: { projectId, insight, stageSettings: vis } }).catch(() => ({ error: "Could not save." }));
    setBusy(false);
    if ("error" in r && r.error) toast.error(r.error); else { toast.success("Saved."); qc.invalidateQueries({ queryKey: ["my-portfolio-project", projectId] }); qc.invalidateQueries({ queryKey: ["my-portfolio"] }); }
  }
  const setStage = (id: string, k: keyof StageVisibility, v: boolean) => setVis((x) => ({ ...x, [id]: { ...x[id], [k]: v } }));

  return (
    <Shell>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3"><Link to="/portfolio">← Portfolio</Link></Button>
        <Button asChild variant="outline" size="sm" className="ml-auto"><Link to="/portfolio/preview/$projectId" params={{ projectId }}>Preview as visitor</Link></Button>
      </div>
      <ProjectHeader project={project} />
      {!showScores && <p className="mt-2 text-xs text-muted-foreground">Scores are hidden from visitors. Turn on “Show scores” in your portfolio settings to show them.</p>}
      <section className="mt-8 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold">Insight</h2>
          <Button size="sm" variant="ghost" className="ml-auto" disabled={busy || generationsLeft <= 0} onClick={async () => {
            setBusy(true);
            const r = await regen({ data: { projectId } }).catch(() => ({ error: "Could not write an insight." }));
            setBusy(false);
            if ("error" in r && r.error) toast.error(r.error); else if ("insight" in r && r.insight) { setInsight(r.insight); toast.success("New insight written. Review it, then save."); qc.invalidateQueries({ queryKey: ["my-portfolio-project", projectId] }); }
          }}><Sparkles className="mr-1 h-4 w-4" />Write with AI ({generationsLeft} left)</Button>
        </div>
        <p className="text-xs text-muted-foreground">Written only from your answers and grading feedback. Check it and edit before publishing.</p>
        <Textarea rows={4} value={insight} onChange={(e) => setInsight(e.target.value)} maxLength={INSIGHT_MAX} />
        <p className="text-right text-xs text-muted-foreground">{insight.length}/{INSIGHT_MAX}</p>
      </section>
      <section className="mt-6 space-y-4">
        <h2 className="font-display text-lg font-semibold">Approach, stage by stage</h2>
        <p className="text-xs text-muted-foreground">Choose what visitors see for each stage. Uploaded files and recordings are never shown.</p>
        {project.stages.map((s, i) => {
          const v = vis[s.taskId] ?? s.visibility;
          return (
            <Card key={s.taskId}><CardContent className="space-y-3 p-5">
              <h3 className="font-semibold">Stage {i + 1}: {s.title}</h3>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><Switch checked={v.summary} onCheckedChange={(x) => setStage(s.taskId, "summary", x)} />Stage summary</label>
                <label className="flex items-center gap-2"><Switch checked={v.replies} onCheckedChange={(x) => setStage(s.taskId, "replies", x)} />My written replies</label>
                {s.tables.length > 0 && <label className="flex items-center gap-2"><Switch checked={v.data} onCheckedChange={(x) => setStage(s.taskId, "data", x)} />Raw datasets</label>}
              </div>
              <div className="space-y-3 opacity-90">
                {v.summary && s.summary && <p className="whitespace-pre-line text-sm text-muted-foreground">{s.summary}</p>}
                {v.data && <DataTables tables={s.tables} />}
                {v.replies && s.replies.map((r, j) => <div key={j}><p className="text-sm font-medium">{r.label}</p><p className="whitespace-pre-line rounded-md bg-muted/50 p-3 text-sm">{r.reply}</p></div>)}
                {!v.summary && !v.replies && !v.data && <p className="text-xs text-muted-foreground">Hidden from visitors.</p>}
              </div>
            </CardContent></Card>
          );
        })}
      </section>
      <div className="mt-6 space-y-1 rounded-lg border border-border p-4 text-xs text-muted-foreground"><p>{PRACTICE_DISCLAIMER}</p>{project.verified && <p>{VERIFIED_MEANING}</p>}</div>
      <div className="sticky bottom-4 mt-6 flex justify-end"><Button onClick={save} disabled={busy}>Save changes</Button></div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background"><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-10">{children}</main></div>;
}
