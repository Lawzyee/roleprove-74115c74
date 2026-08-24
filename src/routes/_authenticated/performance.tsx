import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { ScoreRing } from "@/components/ScoreRing";
import { AttemptTypeBadge } from "@/components/AttemptTypeBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compositeScore, compositeContributors } from "@/lib/simulations";
import { PILLARS, PILLAR_LABELS, type Pillar } from "@/lib/scoring-config";

export const Route = createFileRoute("/_authenticated/performance")({
  head: () => ({
    meta: [
      { title: "Performance breakdown | RoleProve" },
      {
        name: "description",
        content: "See the pillar sub-scores, strengths and focus areas behind your composite RoleProve score.",
      },
      { property: "og:title", content: "Performance breakdown | RoleProve" },
      {
        property: "og:description",
        content: "See the pillar sub-scores, strengths and focus areas behind your composite RoleProve score.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PerformancePage,
});

const PILLAR_MEANING: Record<Pillar, string> = {
  framing: "how clearly you scope an ambiguous business problem before touching data",
  decision_making: "how well you reason through data, trade-offs and analytical judgement",
  communication: "how concise and stakeholder-ready your written summaries are",
  ownership: "how far you push beyond the ask into recommendations and next steps",
};

function PerformancePage() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["performance-attempts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simulation_attempts")
        .select(
          "id, status, overall_score, completed_at, simulation_type, pillar_scores, simulations(title, role_id)",
        )
        .eq("user_id", user!.id)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const attempts = query.data ?? [];
  const composite = compositeScore(attempts as any);
  const contributors = compositeContributors(attempts as any);

  const pillarAverages: Record<string, number | null> = {};
  for (const pillar of PILLARS) {
    const values = contributors
      .map((c) => (c.attempt.pillar_scores ?? {})[pillar])
      .filter((v): v is number => typeof v === "number");
    pillarAverages[pillar] = values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null;
  }

  const scored = PILLARS.filter((p) => typeof pillarAverages[p] === "number");
  const legacyOnly =
    contributors.length > 0 &&
    contributors.every(
      (c) => !c.attempt.pillar_scores || Object.values(c.attempt.pillar_scores).every((v) => typeof v !== "number"),
    );
  const best = scored.length
    ? scored.reduce((a, b) => ((pillarAverages[a] as number) >= (pillarAverages[b] as number) ? a : b))
    : null;
  const worst = scored.length
    ? scored.reduce((a, b) => ((pillarAverages[a] as number) <= (pillarAverages[b] as number) ? a : b))
    : null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/dashboard">← Back to dashboard</Link>
        </Button>
        <h1 className="mt-3 font-display text-3xl font-semibold">Performance breakdown</h1>
        <p className="mt-2 text-muted-foreground">
          How your composite score is built: the best attempt per role, rolled up across four competency pillars.
        </p>

        {query.isLoading && <p className="mt-8 text-muted-foreground">Loading your breakdown…</p>}

        {!query.isLoading && (
          <>
            {legacyOnly && (
              <Card className="mt-6 border-primary/30 bg-primary/5 shadow-none">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <p className="max-w-xl text-sm text-muted-foreground">
                    This score is from an attempt completed before detailed performance breakdowns were introduced, so
                    pillar-level data isn&apos;t available for it. Complete a new simulation to see your pillar-level
                    strengths and focus areas.
                  </p>
                  <Button asChild size="sm">
                    <Link to="/roles">Start a new simulation</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="mt-8 grid gap-6 md:grid-cols-[280px_1fr]">
              <Card className="border-border shadow-none">
                <CardContent className="flex flex-col items-center gap-3 pt-6">
                  <ScoreRing value={composite.score} />
                  <p className="text-center text-xs text-muted-foreground">
                    {composite.score === null
                      ? "Complete a simulation to earn a score"
                      : `Based on ${contributors.length} contributing attempt${contributors.length === 1 ? "" : "s"}`}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-base">Competency pillars</CardTitle>
                  <CardDescription>Averaged across the attempts feeding your composite score.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {PILLARS.map((pillar) => {
                    const value = pillarAverages[pillar];
                    return (
                      <div key={pillar}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">{PILLAR_LABELS[pillar]}</p>
                          <span className="font-display text-sm font-semibold">
                            {typeof value === "number" ? `${value}%` : "—"}
                          </span>
                        </div>
                        <Progress value={typeof value === "number" ? value : 0} className="mt-2 h-2" />
                        {typeof value !== "number" && (
                          <p className="mt-1 text-xs text-muted-foreground">Not evaluated yet.</p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            <Card className="mt-6 border-border shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="font-display text-base">Strengths and focus areas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {!scored.length && <p>Complete a graded simulation to see your strengths and focus areas.</p>}
                {best && (
                  <p>
                    <span className="font-medium text-foreground">Strongest: {PILLAR_LABELS[best]}</span> (
                    {pillarAverages[best]}%) — {PILLAR_MEANING[best]}.
                  </p>
                )}
                {worst && worst !== best && (
                  <p>
                    <span className="font-medium text-foreground">Focus area: {PILLAR_LABELS[worst]}</span> (
                    {pillarAverages[worst]}%) — {PILLAR_MEANING[worst]}. Targeting this pillar will lift your composite
                    score fastest.
                  </p>
                )}
                {worst && worst === best && scored.length === 1 && (
                  <p>Only one pillar has been evaluated so far — complete more stages to widen the picture.</p>
                )}
              </CardContent>
            </Card>

            <h2 className="mt-10 font-display text-xl font-semibold">Contributing attempts</h2>
            <div className="mt-4 space-y-3">
              {contributors.length === 0 && (
                <p className="text-sm text-muted-foreground">No completed attempts are feeding your score yet.</p>
              )}
              {contributors.map(({ attempt, isFallback }) => (
                <Card key={attempt.id} className="border-border shadow-none">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{attempt.simulations?.title ?? "Simulation"}</p>
                        <AttemptTypeBadge type={attempt.simulation_type} />
                        {isFallback && <Badge variant="outline">Practice fallback</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isFallback
                          ? "No JD-matched attempt for this role yet — a practice attempt is standing in."
                          : "Best JD-matched attempt for this role."}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-display text-lg font-semibold">{attempt.overall_score}</span>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/results/$attemptId" params={{ attemptId: attempt.id }}>
                          View results
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
