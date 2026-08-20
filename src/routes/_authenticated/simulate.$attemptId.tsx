import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration, type Rubric } from "@/lib/simulations";
import { gradeAttemptFn } from "@/lib/grading.functions";

export const Route = createFileRoute("/_authenticated/simulate/$attemptId")({
  head: () => ({
    meta: [
      { title: "Simulation in progress | RoleProve" },
      { name: "description", content: "Work through the scenario tasks and submit your answers for scoring." },
      { property: "og:title", content: "Simulation in progress | RoleProve" },
      { property: "og:description", content: "Work through the scenario tasks and submit your answers for scoring." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SimulationRunner,
});

function SimulationRunner() {
  const { attemptId } = Route.useParams();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>({});

  const query = useQuery({
    queryKey: ["attempt-run", attemptId],
    queryFn: async () => {
      const { data: attempt, error } = await supabase
        .from("simulation_attempts")
        .select("id, status, simulation_id, simulations(title, description)")
        .eq("id", attemptId)
        .single();
      if (error) throw error;

      const { data: tasks, error: taskError } = await supabase
        .from("simulation_tasks")
        .select("id, title, brief, task_type, rubric_criteria, order")
        .eq("simulation_id", attempt.simulation_id)
        .order("order");
      if (taskError) throw taskError;

      const { data: results } = await supabase
        .from("attempt_task_results")
        .select("task_id, response")
        .eq("attempt_id", attemptId);

      return { attempt, tasks: tasks ?? [], results: results ?? [] };
    },
  });

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!query.data) return;
    if (query.data.attempt.status === "completed") {
      router.navigate({ to: "/results/$attemptId", params: { attemptId } });
      return;
    }
    const preload: Record<string, Record<string, unknown>> = {};
    for (const r of query.data.results) preload[r.task_id] = (r.response ?? {}) as Record<string, unknown>;
    setAnswers(preload);
    const answeredCount = query.data.tasks.findIndex((t: any) => !preload[t.id]);
    setIndex(answeredCount === -1 ? Math.max(0, query.data.tasks.length - 1) : answeredCount);
  }, [query.data, attemptId, router]);

  const tasks = query.data?.tasks ?? [];
  const task = tasks[index] as any;
  const rubric = useMemo<Rubric>(() => (task?.rubric_criteria ?? {}) as Rubric, [task]);
  const current = task ? (answers[task.id] ?? {}) : {};

  function setValue(key: string, value: unknown) {
    if (!task) return;
    setAnswers((prev) => ({ ...prev, [task.id]: { ...(prev[task.id] ?? {}), [key]: value } }));
  }

  async function submitTask() {
    if (!task) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("attempt_task_results")
        .upsert(
          { attempt_id: attemptId, task_id: task.id, response: current as any },
          { onConflict: "attempt_id,task_id" },
        );
      if (error) throw error;

      if (index < tasks.length - 1) {
        setIndex(index + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        toast.info("Scoring your work…");
        await gradeAttemptFn({ data: { attemptId } });
        router.navigate({ to: "/results/$attemptId", params: { attemptId } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your answer");
    } finally {
      setSubmitting(false);
    }
  }

  if (query.isLoading) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-5 py-16 text-muted-foreground">Loading simulation…</main>
      </>
    );
  }

  if (!task) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-5 py-16 text-muted-foreground">This simulation has no tasks yet.</main>
      </>
    );
  }

  const canSubmit = (() => {
    if (task.task_type === "text") return String(current["text"] ?? "").trim().length > 0;
    if (task.task_type === "multiple_choice") return typeof current["choice"] === "number";
    return (rubric.fields ?? []).every((f) => String(current[f.key] ?? "").length > 0);
  })();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {(query.data?.attempt as any)?.simulations?.title}
            </p>
            <h1 className="font-display text-2xl font-semibold">
              Task {index + 1} of {tasks.length}: {task.title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {formatDuration(elapsed)}
          </div>
        </div>

        <Progress value={((index + (canSubmit ? 1 : 0)) / tasks.length) * 100} className="mt-4 h-2" />

        <Card className="mt-6 border-border shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-base">Brief</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{task.brief}</pre>
          </CardContent>
        </Card>

        <Card className="mt-5 border-border shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-base">Your answer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {task.task_type === "text" && (
              <div className="space-y-2">
                {rubric.prompt_label && <Label htmlFor="answer-text">{rubric.prompt_label}</Label>}
                <Textarea
                  id="answer-text"
                  rows={10}
                  value={String(current["text"] ?? "")}
                  onChange={(e) => setValue("text", e.target.value)}
                  placeholder="Write your response here…"
                />
              </div>
            )}

            {task.task_type === "structured" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {(rubric.fields ?? []).map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    <Input
                      id={field.key}
                      type={field.type === "text" ? "text" : "number"}
                      step="0.01"
                      value={String(current[field.key] ?? "")}
                      onChange={(e) => setValue(field.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}

            {task.task_type === "multiple_choice" && (
              <RadioGroup
                value={current["choice"] !== undefined ? String(current["choice"]) : ""}
                onValueChange={(v) => setValue("choice", Number(v))}
                className="space-y-2"
              >
                {(rubric.options ?? []).map((option, i) => (
                  <label
                    key={i}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-muted"
                  >
                    <RadioGroupItem value={String(i)} className="mt-0.5" />
                    <span className="text-sm">{option}</span>
                  </label>
                ))}
              </RadioGroup>
            )}

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">The timer is informational — take the time you need.</p>
              <Button onClick={submitTask} disabled={!canSubmit || submitting}>
                {submitting
                  ? "Saving…"
                  : index < tasks.length - 1
                    ? "Submit and continue"
                    : "Submit and get my score"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
