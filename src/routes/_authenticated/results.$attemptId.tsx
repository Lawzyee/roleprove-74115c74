import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { ScoreRing } from "@/components/ScoreRing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startAttempt } from "@/lib/simulations";

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

  const query = useQuery({
    queryKey: ["attempt-results", attemptId],
    queryFn: async () => {
      const { data: attempt, error } = await supabase
        .from("simulation_attempts")
        .select("id, status, overall_score, completed_at, simulation_id, simulations(title, description)")
        .eq("id", attemptId)
        .single();
      if (error) throw error;

      const { data: results, error: rErr } = await supabase
        .from("attempt_task_results")
        .select("id, task_id, score, max_score, feedback, simulation_tasks(title, order, task_type)")
        .eq("attempt_id", attemptId);
      if (rErr) throw rErr;

      return { attempt, results: (results ?? []).slice().sort((a: any, b: any) => (a.simulation_tasks?.order ?? 0) - (b.simulation_tasks?.order ?? 0)) };
    },
  });

  async function retake() {
    if (!user || !query.data) return;
    try {
      const newId = await startAttempt(user.id, (query.data.attempt as any).simulation_id);
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
            <Badge variant="secondary">Practice attempt</Badge>
            <h1 className="mt-3 font-display text-3xl font-semibold">{attempt.simulations?.title}</h1>
            <p className="mt-2 text-muted-foreground">{attempt.simulations?.description}</p>

            <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8">
              <ScoreRing value={attempt.overall_score} />
              <p className="text-center text-sm text-muted-foreground">
                Scored against the role rubric. Written answers are AI-assessed; structured and multiple-choice tasks
                are rule-graded.
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
                    <CardDescription className="pt-2">{r.feedback ?? "No feedback recorded."}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0" />
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
