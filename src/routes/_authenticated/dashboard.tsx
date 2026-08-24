import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { ScoreRing } from "@/components/ScoreRing";
import { JobDescriptionPaste } from "@/components/JobDescriptionPaste";
import { AttemptTypeBadge } from "@/components/AttemptTypeBadge";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compositeScore, roleBestScore, FREE_ATTEMPT_LIMIT } from "@/lib/simulations";
import { useServerFn } from "@tanstack/react-start";
import { generateGenericSimulationFn } from "@/lib/jd.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | RoleProve" },
      { name: "description", content: "Your composite skills score, available simulations and attempt history." },
      { property: "og:title", content: "Dashboard | RoleProve" },
      { property: "og:description", content: "Your composite skills score, available simulations and attempt history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<"all" | "completed" | "in_progress">("all");
  const historyRef = useRef<HTMLElement | null>(null);

  function showHistory(status: "completed" | "in_progress") {
    setHistoryFilter((prev) => (prev === status ? "all" : status));
    historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const generateGeneric = useServerFn(generateGenericSimulationFn);


  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });


  const rolesQuery = useQuery({
    queryKey: ["roles-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("id, name").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const attemptsQuery = useQuery({
    queryKey: ["attempts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simulation_attempts")
        .select("id, status, overall_score, started_at, completed_at, simulation_type, simulations(title, role_id)")
        .eq("user_id", user!.id)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });


  const attempts = attemptsQuery.data ?? [];
  const composite = compositeScore(attempts);
  const targetRoleId: string | null = (profileQuery.data as any)?.target_role_id ?? null;
  const targetRoleName = (rolesQuery.data ?? []).find((r: any) => r.id === targetRoleId)?.name ?? null;
  const roleScore = targetRoleId ? roleBestScore(attempts, targetRoleId) : null;
  const score = roleScore?.score ?? composite.score;
  const completedCount = attempts.filter((a) => a.status === "completed").length;
  const visibleAttempts =
    historyFilter === "all" ? attempts : attempts.filter((a) => a.status === historyFilter);

  async function onStart(simulationId: string) {
    if (!user) {
      toast.error("Please log in again to start a simulation.");
      return;
    }
    setStartingId(simulationId);
    try {
      const { attemptId } = await generateGeneric();
      router.navigate({ to: "/simulate/$attemptId", params: { attemptId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the simulation");
    } finally {
      setStartingId(null);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">
          {profileQuery.data?.name ? `Hi ${profileQuery.data.name.split(" ")[0]},` : "Welcome back,"} ready to practise?
        </h1>
        <p className="mt-2 text-muted-foreground">
          Your score reflects your best verified (JD-matched) attempt per role — a weaker practice run never pulls it
          down. Practice attempts count toward your completed total and are used only when a role has no verified
          attempt yet.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="border-border shadow-none">
            <CardContent className="flex flex-col items-center gap-6 pt-6">
              <button
                type="button"
                onClick={() => router.navigate({ to: "/performance" })}
                className="rounded-2xl transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="View performance breakdown"
              >
                <ScoreRing value={score} />
                <span className="mt-1 block text-xs font-medium text-primary">View breakdown →</span>
              </button>
              <p className="-mt-3 text-center text-xs text-muted-foreground">
                {!targetRoleId ? (
                  <>
                    {composite.score === null
                      ? "Complete a simulation to earn a score"
                      : `Best attempt per role · ${composite.attemptCount} attempt${composite.attemptCount === 1 ? "" : "s"} completed`}
                    <br />
                    <Link to="/profile" className="font-medium text-primary">
                      Set your target role to see a role-specific score →
                    </Link>
                  </>
                ) : roleScore && roleScore.score !== null ? (
                  `${targetRoleName} · best ${roleScore.basis === "verified" ? "JD-matched" : "practice"} attempt of ${roleScore.attemptCount}`
                ) : (
                  `We don't have simulations for ${targetRoleName ?? "your target role"} yet — showing your overall score.`
                )}
              </p>
              <div className="grid w-full grid-cols-2 gap-3 text-center">
                <button
                  type="button"
                  onClick={() => showHistory("completed")}
                  className={`rounded-xl p-3 transition hover:bg-muted/70 ${historyFilter === "completed" ? "bg-primary/10 ring-1 ring-primary" : "bg-muted"}`}
                >
                  <p className="font-display text-xl font-semibold">{completedCount}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </button>
                <button
                  type="button"
                  onClick={() => showHistory("in_progress")}
                  className={`rounded-xl p-3 transition hover:bg-muted/70 ${historyFilter === "in_progress" ? "bg-primary/10 ring-1 ring-primary" : "bg-muted"}`}
                >
                  <p className="font-display text-xl font-semibold">
                    {attempts.filter((a) => a.status === "in_progress").length}
                  </p>
                  <p className="text-xs text-muted-foreground">In progress</p>
                </button>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {FREE_ATTEMPT_LIMIT - completedCount > 0
                  ? `${FREE_ATTEMPT_LIMIT - completedCount} free simulation${FREE_ATTEMPT_LIMIT - completedCount === 1 ? "" : "s"} left`
                  : "Free simulations used"}
              </p>
            </CardContent>
          </Card>


          <div className="space-y-6">
            <JobDescriptionPaste onStartGeneric={() => onStart("data-analyst")} />

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold">Available simulations</h2>
                <Button asChild variant="outline" size="sm">
                  <Link to="/roles">Browse all roles →</Link>
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="border-border shadow-none">
                  <CardHeader className="pb-3">
                    <Badge variant="secondary" className="w-fit">
                      Data Analyst
                    </Badge>
                    <CardTitle className="font-display text-base">Data Analyst — Case Study Practice</CardTitle>
                    <CardDescription className="line-clamp-3">
                      Work through a full case study from business framing through executive presentation. A new scenario
                      is generated each time you start.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">~45-60 min</span>
                    <Button size="sm" onClick={() => onStart("data-analyst")} disabled={startingId === "data-analyst"}>
                      {startingId === "data-analyst" ? "Building your case study…" : "Start simulation"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </section>

            <section ref={historyRef}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold">Your history</h2>
                {historyFilter !== "all" && (
                  <Button variant="ghost" size="sm" onClick={() => setHistoryFilter("all")}>
                    Showing {historyFilter === "completed" ? "completed" : "in progress"} · Clear filter
                  </Button>
                )}
              </div>
              <Card className="border-border shadow-none">
                <CardContent className="divide-y divide-border p-0">
                  {visibleAttempts.length === 0 && (
                    <p className="p-6 text-sm text-muted-foreground">
                      {historyFilter === "all"
                        ? "No attempts yet. Start a simulation above to build your score."
                        : `No ${historyFilter === "completed" ? "completed" : "in-progress"} attempts.`}
                    </p>
                  )}
                  {visibleAttempts.map((attempt: any) => (
                    <div key={attempt.id} className="flex items-center justify-between gap-4 p-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{attempt.simulations?.title}</p>
                          <AttemptTypeBadge type={attempt.simulation_type} />
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Started {new Date(attempt.started_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {attempt.status === "completed" ? (
                          <>
                            <span className="font-display text-lg font-semibold">{attempt.overall_score}</span>
                            <Button asChild size="sm" variant="outline">
                              <Link to="/results/$attemptId" params={{ attemptId: attempt.id }}>
                                View results
                              </Link>
                            </Button>
                          </>
                        ) : (
                          <Button asChild size="sm">
                            <Link to="/simulate/$attemptId" params={{ attemptId: attempt.id }}>
                              Continue
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
