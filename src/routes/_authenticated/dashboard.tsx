import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { ScoreRing } from "@/components/ScoreRing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { compositeScore, startAttempt, FREE_ATTEMPT_LIMIT } from "@/lib/simulations";

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

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const simsQuery = useQuery({
    queryKey: ["simulations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simulations")
        .select("id, title, description, estimated_minutes, roles(name)")
        .order("created_at");
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
        .select("id, status, overall_score, started_at, completed_at, simulations(title)")
        .eq("user_id", user!.id)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const attempts = attemptsQuery.data ?? [];
  const score = compositeScore(attempts);
  const completedCount = attempts.filter((a) => a.status === "completed").length;

  async function onStart(simulationId: string) {
    if (!user) return;
    if (completedCount >= FREE_ATTEMPT_LIMIT) {
      router.navigate({ to: "/subscribe" });
      return;
    }
    try {
      const attemptId = await startAttempt(user.id, simulationId);
      router.navigate({ to: "/simulate/$attemptId", params: { attemptId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the simulation");
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
          Your score is the average of every simulation you complete. Retakes count too.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="border-border shadow-none">
            <CardContent className="flex flex-col items-center gap-6 pt-6">
              <ScoreRing value={score} />
              <div className="grid w-full grid-cols-2 gap-3 text-center">
                <div className="rounded-xl bg-muted p-3">
                  <p className="font-display text-xl font-semibold">{completedCount}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <p className="font-display text-xl font-semibold">
                    {attempts.filter((a) => a.status === "in_progress").length}
                  </p>
                  <p className="text-xs text-muted-foreground">In progress</p>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {FREE_ATTEMPT_LIMIT - completedCount > 0
                  ? `${FREE_ATTEMPT_LIMIT - completedCount} free simulation${FREE_ATTEMPT_LIMIT - completedCount === 1 ? "" : "s"} left`
                  : "Free simulations used"}
              </p>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold">Available simulations</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/roles">Browse all roles</Link>
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(simsQuery.data ?? []).map((sim: any) => (
                  <Card key={sim.id} className="border-border shadow-none">
                    <CardHeader className="pb-3">
                      <Badge variant="secondary" className="w-fit">
                        {sim.roles?.name}
                      </Badge>
                      <CardTitle className="font-display text-base">{sim.title}</CardTitle>
                      <CardDescription className="line-clamp-3">{sim.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">~{sim.estimated_minutes} min</span>
                      <Button size="sm" onClick={() => onStart(sim.id)}>
                        Start simulation
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-3 font-display text-xl font-semibold">Your history</h2>
              <Card className="border-border shadow-none">
                <CardContent className="divide-y divide-border p-0">
                  {attempts.length === 0 && (
                    <p className="p-6 text-sm text-muted-foreground">
                      No attempts yet. Start a simulation above to build your score.
                    </p>
                  )}
                  {attempts.map((attempt: any) => (
                    <div key={attempt.id} className="flex items-center justify-between gap-4 p-4">
                      <div>
                        <p className="font-medium">{attempt.simulations?.title}</p>
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
