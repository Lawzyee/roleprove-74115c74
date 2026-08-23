import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { ScoreRing } from "@/components/ScoreRing";
import { AttemptTypeBadge } from "@/components/AttemptTypeBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startAttempt } from "@/lib/simulations";
import { useServerFn } from "@tanstack/react-start";
import { generateGenericSimulationFn } from "@/lib/jd.functions";

export const Route = createFileRoute("/_authenticated/results/$attemptId")({
  head: () => ({
    meta: [
      { title: "Simulation results | RoleProve" },
      { name: "description", content: "See your overall score and per-task rubric feedback for this simulation." },
      { property: "og:title", content: "Simulation results | RoleProve" },
      { property: "og:description", content: "See your overall score and per-task rubric feedback for this simulation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const { attemptId } = Route.useParams();
  const { user } = useAuth();
  const router = useRouter();
  const generateGeneric = useServerFn(generateGenericSimulationFn);

  const query = useQuery({
    queryKey: ["attempt-results", attemptId],
    queryFn: async () => {
      const { data: attempt, error } = await supabase
        .from("simulation_attempts")
        .select("id, status, overall_score, completed_at, simulation_id, simulation_type, simulations(title, description)")
        .eq("id", attemptId)
        .single();
      if (error) throw error;

      const { data: results, error: rErr } = await supabase
        .from("attempt_task_results")
        .select("id, task_id, score, max_score, feedback, simulation_tasks(title, order, task_type)")
        .eq("attempt_id", attemptId);
      if (rErr) throw rErr;

      const { data: deliverables } = await supabase
        .from("attempt_deliverables")
        .select("id, task_id, file_name, file_type, status, feedback, uploaded_at")
        .eq("attempt_id", attemptId);

      return { attempt, deliverables: deliverables ?? [], results: (results ?? []).slice().sort((a: any, b: any) => (a.simulation_tasks?.order ?? 0) - (b.simulation_tasks?.order ?? 0)) };
    },
  });

  async function retake() {
    if (!user || !query.data) return;
    try {
      const current = query.data.attempt as any;
      if (current.simulation_type === "generic") {
        const { attemptId: freshId } = await generateGeneric();
        router.navigate({ to: "/simulate/$attemptId", params: { attemptId: freshId } });
        return;
      }
      const newId = await startAttempt(user.id, current.simulation_id);
      router.navigate({ to: "/simulate/$attemptId", params: { attemptId: newId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start a retake");
    }
  }

  const attempt = query.data?.attempt as any;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        {query.isLoading && <p className="text-muted-foreground">Loading results…</p>}

        {attempt && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Practice attempt</Badge>
              <AttemptTypeBadge type={attempt.simulation_type} />
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold">{attempt.simulations?.title}</h1>
            <p className="mt-2 text-muted-foreground">{attempt.simulations?.description}</p>

            <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8">
              <ScoreRing value={attempt.overall_score} />
              <p className="text-center text-sm text-muted-foreground">
                Scored against the role rubric. Written answers are AI-assessed; structured and multiple-choice tasks
                are rule-graded. Uploaded work samples are stored as evidence and never change your score.
              </p>
            </div>

            <h2 className="mt-10 font-display text-xl font-semibold">Task breakdown</h2>
            <div className="mt-4 space-y-4">
              {query.data?.results.map((r: any) => (
                <Card key={r.id} className="border-border shadow-none">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-4">
                      <CardTitle className="font-display text-base">{r.simulation_tasks?.title}</CardTitle>
                      <span className="shrink-0 font-display text-sm font-semibold">
                        {r.score ?? 0} / {r.max_score}
                      </span>
                    </div>
                    <Progress value={((r.score ?? 0) / (r.max_score || 1)) * 100} className="h-2" />
                    <CardDescription className="whitespace-pre-wrap pt-2">
                      {r.feedback ?? "No feedback recorded."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {(query.data?.deliverables ?? [])
                      .filter((d: any) => d.task_id === r.task_id)
                      .map((d: any) => (
                        <div key={d.id} className="rounded-xl border border-border bg-muted/50 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{d.file_name}</span>
                            <Badge variant={d.status === "auto_checked" ? "secondary" : "outline"}>
                              {d.status === "auto_checked" ? "Work sample checked" : "Submitted — pending review"}
                            </Badge>
                          </div>
                          {d.feedback && <p className="mt-1 text-xs text-muted-foreground">{d.feedback}</p>}
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={retake}>Retake simulation</Button>
              <Button asChild variant="outline">
                <Link to="/dashboard">Back to dashboard</Link>
              </Button>
            </div>
          </>
        )}
      </main>
    </>
  );
}
