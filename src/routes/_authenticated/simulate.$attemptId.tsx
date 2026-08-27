import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { DeliverableUpload } from "@/components/DeliverableUpload";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  downloadDatasetCsv,
  formatDuration,
  STAGE_LABELS,
  type Dataset,
  type Rubric,
  type SummaryTable,
} from "@/lib/simulations";
import { gradeAttemptFn } from "@/lib/grading.functions";
import { useAuth } from "@/hooks/useAuth";
import { VerifiedAttemptGate } from "@/components/VerifiedAttemptGate";
import { AttemptRecorder, RECORDING_BUCKET, stopStream, type ProctorStreams } from "@/lib/proctoring";


export const Route = createFileRoute("/_authenticated/simulate/$attemptId")({
  head: () => ({
    meta: [
      { title: "Simulation in progress | RoleProve" },
      { name: "description", content: "Work through the scenario stages and submit your answers for scoring." },
      { property: "og:title", content: "Simulation in progress | RoleProve" },
      { property: "og:description", content: "Work through the scenario stages and submit your answers for scoring." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SimulationRunner,
});

function DataTable({ columns, rows }: { columns: Array<{ key: string; label: string }>; rows: Array<Record<string, string>> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/60">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="whitespace-nowrap px-3 py-2 font-medium">
                {col.label || col.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {columns.map((col) => (
                <td key={col.key} className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimulationRunner() {
  const { attemptId } = Route.useParams();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>({});
  const [gateBusy, setGateBusy] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const recorderRef = useRef<AttemptRecorder | null>(null);

  const query = useQuery({
    queryKey: ["attempt-run", attemptId],
    queryFn: async () => {
      const { data: attempt, error } = await supabase
        .from("simulation_attempts")
        .select(
          "id, status, simulation_id, simulation_type, proctoring_mode, recording_file_path, simulations(title, description, estimated_minutes)",
        )
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

  useEffect(() => () => recorderRef.current?.dispose(), []);

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

  const datasets = useMemo<Dataset[]>(() => {
    if (rubric.datasets?.length) return rubric.datasets;
    return rubric.dataset ? [rubric.dataset] : [];
  }, [rubric]);
  const tables = useMemo<SummaryTable[]>(() => rubric.tables ?? [], [rubric]);

  function setValue(key: string, value: unknown) {
    if (!task) return;
    setAnswers((prev) => ({ ...prev, [task.id]: { ...(prev[task.id] ?? {}), [key]: value } }));
  }

  async function persistCurrent() {
    if (!task) return;
    const { error } = await supabase
      .from("attempt_task_results")
      .upsert(
        { attempt_id: attemptId, task_id: task.id, response: current as any },
        { onConflict: "attempt_id,task_id" },
      );
    if (error) throw error;
  }

  async function goBack() {
    if (index === 0) return;
    setSubmitting(true);
    try {
      await persistCurrent();
      setIndex(index - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your answer");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTask() {
    if (!task) return;
    setSubmitting(true);
    try {
      await persistCurrent();

      if (index < tasks.length - 1) {
        setIndex(index + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setReviewing(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your answer");
    } finally {
      setSubmitting(false);
    }
  }

  async function finalSubmit() {
    setSubmitting(true);
    try {
      toast.info("Scoring your work…");
      await gradeAttemptFn({ data: { attemptId } });
      router.navigate({ to: "/results/$attemptId", params: { attemptId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit your attempt");
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
    if (task.task_type === "case") {
      const fieldsOk = (rubric.fields ?? []).every((f) => String(current[f.key] ?? "").length > 0);
      const writtenOk = (rubric.written ?? []).every((w) => String(current[w.key] ?? "").trim().length > 0);
      return fieldsOk && writtenOk;
    }
    if (task.task_type === "text") return String(current["text"] ?? "").trim().length > 0;
    if (task.task_type === "multiple_choice") return typeof current["choice"] === "number";
    return (rubric.fields ?? []).every((f) => String(current[f.key] ?? "").length > 0);
  })();

  const stageLabel = rubric.stage_kind ? STAGE_LABELS[rubric.stage_kind] : null;

  if (reviewing) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-5 py-10">
          <h1 className="font-display text-2xl font-semibold">Review your answers</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Check everything below before final submission. You can edit any stage, then come back here.
          </p>

          <div className="mt-6 space-y-4">
            {tasks.map((t: any, i: number) => {
              const r = (t.rubric_criteria ?? {}) as Rubric;
              const a = answers[t.id] ?? {};
              const entries: Array<{ label: string; value: string }> = [];
              for (const f of r.fields ?? []) entries.push({ label: f.label, value: String(a[f.key] ?? "") });
              for (const w of r.written ?? []) entries.push({ label: w.label, value: String(a[w.key] ?? "") });
              if (t.task_type === "text") entries.push({ label: r.prompt_label ?? "Answer", value: String(a["text"] ?? "") });
              if (t.task_type === "multiple_choice")
                entries.push({
                  label: "Selected option",
                  value: typeof a["choice"] === "number" ? ((r.options ?? [])[a["choice"] as number] ?? "") : "",
                });

              return (
                <Card key={t.id} className="border-border shadow-none">
                  <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                    <CardTitle className="font-display text-base">
                      Stage {i + 1}: {t.title}
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setReviewing(false);
                        setIndex(i);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Edit
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {entries.length === 0 && <p className="text-sm text-muted-foreground">No answer recorded.</p>}
                    {entries.map((e, k) => (
                      <div key={k} className="space-y-1">
                        <p className="text-sm font-medium">{e.label}</p>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {e.value.trim() ? e.value : "— not answered —"}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setReviewing(false);
                setIndex(Math.max(0, tasks.length - 1));
              }}
              disabled={submitting}
            >
              Back to last stage
            </Button>
            <Button onClick={finalSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit and get my score"}
            </Button>
          </div>
        </main>
      </>
    );
  }


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
              Stage {index + 1} of {tasks.length}: {task.title}
            </h1>
            {stageLabel && (
              <Badge variant="secondary" className="mt-2">
                {stageLabel}
              </Badge>
            )}
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

        {datasets.map((dataset) =>
          dataset.rows.length ? (
            <Card key={dataset.name} className="mt-5 border-border shadow-none">
              <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
                <CardTitle className="font-display text-base">Dataset — {dataset.name}.csv</CardTitle>
                <Button variant="outline" size="sm" onClick={() => downloadDatasetCsv(dataset)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </CardHeader>
              <CardContent>
                <DataTable columns={dataset.columns} rows={dataset.rows} />
              </CardContent>
            </Card>
          ) : null,
        )}

        {tables.map((table, i) => (
          <Card key={i} className="mt-5 border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-base">{table.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable columns={table.columns} rows={table.rows} />
            </CardContent>
          </Card>
        ))}

        <Card className="mt-5 border-border shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-base">Question</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {(task.task_type === "case" || task.task_type === "structured") && (rubric.fields ?? []).length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {(rubric.fields ?? []).map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    <Input
                      id={field.key}
                      type="text"
                      inputMode="text"
                      value={String(current[field.key] ?? "")}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      placeholder="Type your answer…"
                    />
                  </div>
                ))}
              </div>
            )}

            {task.task_type === "case" &&
              (rubric.written ?? []).map((question) => (
                <div key={question.key} className="space-y-2">
                  <Label htmlFor={question.key}>
                    {question.label} <span className="text-muted-foreground">({question.points} pts)</span>
                  </Label>
                  <p className="text-sm text-muted-foreground">{question.prompt}</p>
                  <Textarea
                    id={question.key}
                    rows={question.input === "sql" ? 8 : 7}
                    className={question.input === "sql" ? "font-mono text-sm" : undefined}
                    value={String(current[question.key] ?? "")}
                    onChange={(e) => setValue(question.key, e.target.value)}
                    placeholder={question.input === "sql" ? "SELECT …" : "Write your response here…"}
                  />
                </div>
              ))}

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

            {rubric.deliverable && (
              <DeliverableUpload
                attemptId={attemptId}
                taskId={task.id}
                label={rubric.deliverable.label}
                hint={rubric.deliverable.hint}
                accept={rubric.deliverable.accept}
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <p className="text-xs text-muted-foreground">The timer is informational — take the time you need.</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={goBack} disabled={index === 0 || submitting}>
                  Back
                </Button>
                <Button onClick={submitTask} disabled={!canSubmit || submitting}>
                  {submitting
                    ? "Saving…"
                    : index < tasks.length - 1
                      ? "Submit and continue"
                      : "Review all answers"}
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>
      </main>
    </>
  );
}
