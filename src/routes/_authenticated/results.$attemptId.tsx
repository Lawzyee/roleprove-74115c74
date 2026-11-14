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
import { PILLARS, PILLAR_LABELS, TIER_LABELS, type Pillar } from "@/lib/scoring-config";
import { useServerFn } from "@tanstack/react-start";
import { generateGenericSimulationFn, retakeSimulationFn } from "@/lib/jd.functions";
import { roleKeyForId } from "@/lib/role-registry";
import { getStripeEnvironment } from '@/lib/stripe';
import { useEffect, useRef, useState } from "react";
import { gradeDeliverablesFn } from "@/lib/deliverables.functions";
import { DeliverableResult, FilePickButton, useDeliverableUploader, type DeliverableRow } from "@/components/DeliverableUpload";

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

  const gradeFn = useServerFn(gradeDeliverablesFn);
  const [gradingLegacy, setGradingLegacy] = useState(false);
  const autoStarted = useRef(false);
  const query = useQuery({
    refetchInterval: (q) => ((q.state.data as any)?.deliverables ?? []).some((d: any) => d.grading_status === "grading") ? 4000 : false,
    queryKey: ["attempt-results", attemptId],
    queryFn: async () => {
      const { data: attempt, error } = await supabase
        .from("simulation_attempts")
        .select("id, status, overall_score, completed_at, simulation_id, simulation_type, pillar_scores, proctoring_mode, recording_file_path, recording_consent_given_at, simulations(title, description, role_id)")
        .eq("id", attemptId)
        .single();
      if (error) throw error;

      const { data: results, error: rErr } = await supabase
        .from("attempt_task_results")
        .select("id, task_id, score, max_score, feedback, criteria_breakdown, pillar, simulation_tasks(title, order, task_type, rubric_criteria)")
        .eq("attempt_id", attemptId);
      if (rErr) throw rErr;

      const { data: deliverables } = await supabase
        .from("attempt_deliverables")
        .select("id, task_id, file_name, file_type, grading_status, failure_reason, criteria, extraction_preview, uploaded_at")
        .eq("attempt_id", attemptId);

      let recordingUrl: string | null = null;
      if (attempt.recording_file_path) {
        const { data: signed } = await supabase.storage
          .from("attempt-recordings")
          .createSignedUrl(attempt.recording_file_path, 3600);
        recordingUrl = signed?.signedUrl ?? null;
      }

      return { attempt, recordingUrl, deliverables: deliverables ?? [], results: (results ?? []).slice().sort((a: any, b: any) => (a.simulation_tasks?.order ?? 0) - (b.simulation_tasks?.order ?? 0)) };
    },
  });

  async function runGrading(includeLegacy = false) {
    try {
      const res = await gradeFn({ data: { attemptId, includeLegacy } });
      if (res.message) toast.message(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Grading didn't finish. Please try again.");
    } finally {
      await query.refetch();
    }
  }

  // Grade freshly submitted uploads on the server; the page stays usable and shows live status.
  useEffect(() => {
    const ds = (query.data?.deliverables ?? []) as DeliverableRow[];
    if (autoStarted.current || query.data?.attempt?.status !== "completed") return;
    if (!ds.some((d) => d.grading_status === "submitted" && !d.failure_reason)) return;
    autoStarted.current = true;
    void query.refetch();
    void runGrading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  async function retake() {
    if (!user || !query.data) return;
    try {
      const current = query.data.attempt as any;
      if (current.simulation_type === "generic") {
        const roleKey = roleKeyForId(current.simulations?.role_id) ?? "data_analyst";
        const result = await generateGeneric({ data: { environment: getStripeEnvironment(), roleKey } });
        if ('outcome' in result) { router.navigate({ to: '/subscribe' }); return; }
        const freshId = result.attemptId;
        router.navigate({ to: "/simulate/$attemptId", params: { attemptId: freshId } });
        return;
      }
      const result = await retakeSimulationFn({ data: { attemptId, environment: getStripeEnvironment() } });
      if ('outcome' in result) { router.navigate({ to: '/subscribe' }); return; }
      router.navigate({ to: "/simulate/$attemptId", params: { attemptId: result.attemptId } });
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
              <Badge variant={attempt.proctoring_mode === "verified" ? "default" : "secondary"}>
                {attempt.proctoring_mode === "verified" ? "Verified attempt" : "Practice attempt"}
              </Badge>
              <AttemptTypeBadge type={attempt.simulation_type} />
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold">{attempt.simulations?.title}</h1>
            <p className="mt-2 text-muted-foreground">{attempt.simulations?.description}</p>

            <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8">
              <ScoreRing value={attempt.overall_score} />
              <p className="text-center text-sm text-muted-foreground">
                Weighted rubric score: every criterion is tiered (must-have criteria count 3×, good-to-have 1×) and
                rolled up as achieved ÷ possible across the criteria that could actually be evaluated. Criteria marked
                "Cannot evaluate" are excluded rather than scored zero. Uploaded files are graded against their own
                criteria and add evidence to your score; skipping an upload never lowers it.
              </p>
            </div>

            {attempt.proctoring_mode === "verified" && (
              <Card className="mt-8 shadow-none">
                <CardHeader>
                  <CardTitle className="font-display text-lg">Your recording</CardTitle>
                  <CardDescription>
                    Exactly what was captured during this attempt. Only you can view it.
                    {attempt.recording_consent_given_at &&
                      ` Consent given ${new Date(attempt.recording_consent_given_at).toLocaleString()}.`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {query.data?.recordingUrl ? (
                    <video src={query.data.recordingUrl} controls className="w-full rounded-lg border border-border bg-muted" />
                  ) : (
                    <p className="text-sm text-muted-foreground">No recording was found for this attempt.</p>
                  )}
                </CardContent>
              </Card>
            )}

            <h2 className="mt-10 font-display text-xl font-semibold">Competency pillars</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {PILLARS.map((pillar: Pillar) => {
                const value = (attempt.pillar_scores ?? {})[pillar] as number | null | undefined;
                return (
                  <div key={pillar} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{PILLAR_LABELS[pillar]}</p>
                      <span className="font-display text-sm font-semibold">
                        {typeof value === "number" ? `${value}%` : "—"}
                      </span>
                    </div>
                    <Progress value={typeof value === "number" ? value : 0} className="mt-2 h-2" />
                    {typeof value !== "number" && (
                      <p className="mt-1 text-xs text-muted-foreground">Not evaluated in this simulation.</p>
                    )}
                  </div>
                );
              })}
            </div>

            {(query.data?.deliverables ?? []).some((d: any) => d.grading_status === "legacy") && (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                <p className="text-sm">You uploaded files to this attempt before uploads were graded.</p>
                <Button size="sm" disabled={gradingLegacy} onClick={async () => { setGradingLegacy(true); await runGrading(true); setGradingLegacy(false); }}>
                  {gradingLegacy ? "Grading…" : "Grade my earlier uploads"}
                </Button>
              </div>
            )}

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
                    {(r.criteria_breakdown ?? []).length > 0 && (
                      <div className="space-y-2">
                        {(r.criteria_breakdown as any[]).map((c: any, i: number) => (
                          <div key={i} className="rounded-xl border border-border p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <p className="text-sm font-medium">{c.label}</p>
                              <div className="flex shrink-0 items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">
                                  {TIER_LABELS[c.tier as "must_have" | "good_to_have"] ?? c.tier}
                                </Badge>
                                <span className="font-display text-xs font-semibold">
                                  {c.cannot_evaluate
                                    ? "Cannot evaluate"
                                    : `${Math.round(c.score)} / ${Math.round(c.max)}`}
                                </span>
                              </div>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{c.justification}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.simulation_tasks?.rubric_criteria?.deliverable && attempt.status === "completed" && (
                      <TaskDeliverable
                        attemptId={attemptId}
                        taskId={r.task_id}
                        accept={r.simulation_tasks.rubric_criteria.deliverable.accept ?? []}
                        row={((query.data?.deliverables ?? []) as DeliverableRow[]).find((d) => d.task_id === r.task_id) ?? null}
                        onUploaded={() => { autoStarted.current = false; void query.refetch(); }}
                      />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={retake}>Retake simulation</Button>
              <Button asChild variant="outline">
                <Link to="/dashboard">Back to dashboard</Link>
              </Button>
              <Button asChild variant="link">
                <Link to="/support/new" search={{ category: "scoring_dispute", attemptId: attempt.id }}>Dispute this score</Link>
              </Button>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function TaskDeliverable({ attemptId, taskId, accept, row, onUploaded }: { attemptId: string; taskId: string; accept: string[]; row: DeliverableRow | null; onUploaded: () => void }) {
  const { busy, upload } = useDeliverableUploader(attemptId, taskId, onUploaded);
  const canReplace = !row || row.grading_status === "graded" || row.grading_status === "unreadable" || row.grading_status === "submitted";
  const picker = canReplace ? (
    <FilePickButton accept={accept} busy={busy} label={row ? "Replace file" : "Upload file"} onFile={(f) => void upload(f)} />
  ) : null;
  if (!row) {
    return (
      <div className="rounded-xl border border-dashed border-border p-3">
        <p className="text-sm">Upload your work to add more evidence to your score.</p>
        <p className="mt-1 text-xs text-muted-foreground">{accept.join(", ").replace(/\./g, "").toUpperCase()}, up to 10 MB. Skipping this never lowers your score.</p>
        <div className="mt-2">{picker}</div>
      </div>
    );
  }
  return <DeliverableResult d={row}>{row.grading_status === "legacy" ? null : picker}</DeliverableResult>;
}
