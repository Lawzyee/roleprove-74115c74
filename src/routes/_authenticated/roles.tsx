import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FREE_ATTEMPT_LIMIT } from "@/lib/simulations";
import { useServerFn } from "@tanstack/react-start";
import { generateGenericSimulationFn } from "@/lib/jd.functions";
import { ROLE_REGISTRY, roleKeyForId, type RoleKey } from "@/lib/role-registry";
import { getStripeEnvironment } from '@/lib/stripe';

export const Route = createFileRoute("/_authenticated/roles")({
  head: () => ({
    meta: [
      { title: "Role library | RoleProve" },
      { name: "description", content: "Browse hands-on job simulations by role and start practising real tasks." },
      { property: "og:title", content: "Role library | RoleProve" },
      { property: "og:description", content: "Browse hands-on job simulations by role and start practising real tasks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RolesPage,
});

function RolesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [startingId, setStartingId] = useState<string | null>(null);
  const generateGeneric = useServerFn(generateGenericSimulationFn);


  const rolesQuery = useQuery({
    queryKey: ["roles-with-sims"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("id, name, description, category, simulations(id, title, estimated_minutes, is_personalized, owner_user_id)")
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
        .select("id, status")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
  });

  const completedCount = (attemptsQuery.data ?? []).filter((a) => a.status === "completed").length;

  async function onStart(roleKey: RoleKey) {
    const simulationId = roleKey;
    if (!user) {
      toast.error("Please log in again to start a simulation.");
      return;
    }
    setStartingId(simulationId);
    try {
      const result = await generateGeneric({ data: { environment: getStripeEnvironment(), roleKey } });
      if ('outcome' in result) { router.navigate({ to: '/subscribe' }); return; }
      const { attemptId } = result;
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
        <h1 className="font-display text-3xl font-semibold">Role library</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Each simulation puts you inside a real working day for that role. No multiple-choice trivia — actual tasks,
          scored against a rubric.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(rolesQuery.data ?? []).map((role: any) => {
            const live = roleKeyForId(role.id) ? ROLE_REGISTRY[roleKeyForId(role.id)!] : null;
            return (
              <Card key={role.id} className="flex flex-col border-border shadow-none">
                <CardHeader className="pb-3">
                  <Badge variant="secondary" className="w-fit">
                    {role.category}
                  </Badge>
                  <CardTitle className="font-display text-lg">
                    {live ? live.cardTitle : role.name}
                  </CardTitle>
                  <CardDescription>
                    {live ? live.cardDescription : role.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{live ? live.minutes : "In authoring"}</span>
                  {live ? (
                    <Button size="sm" onClick={() => onStart(live.key)} disabled={startingId === live.key}>
                      {startingId === live.key ? "Building your simulation…" : "Start simulation"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      Coming soon
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </>
  );
}
