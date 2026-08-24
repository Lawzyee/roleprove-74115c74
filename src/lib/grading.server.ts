import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rollUp,
  stageScoring,
  TIER_WEIGHT,
  type CriterionResult,
  type Pillar,
  type Tier,
} from "./scoring-config";

type AnyClient = SupabaseClient<any, any, any>;

type WrittenQuestion = { key: string; label: string; prompt: string; criteria: string[]; points: number };

type Rubric = {
  max_score?: number;
  stage_kind?: string;
  fields?: Array<{ key: string; label: string; answer: number; tolerance?: number; points: number }>;
  written?: WrittenQuestion[];
  options?: string[];
  answer?: number;
  points?: number;
  criteria?: string[];
};

type Graded = { score: number; max: number; feedback: string; criteria: CriterionResult[] };

function criterion(
  label: string,
  ctx: { pillar: Pillar; tier: Tier },
  score: number,
  max: number,
  justification: string,
  cannotEvaluate = false,
): CriterionResult {
  return {
    label,
    pillar: ctx.pillar,
    tier: ctx.tier,
    weight: TIER_WEIGHT[ctx.tier],
    score: Math.round(score * 100) / 100,
    max: Math.round(max * 100) / 100,
    cannot_evaluate: cannotEvaluate,
    justification,
  };
}

function gradeStructured(rubric: Rubric, response: Record<string, unknown>, ctx: { pillar: Pillar; tier: Tier }): Graded {
  const fields = rubric.fields ?? [];
  const criteria: CriterionResult[] = [];
  const notes: string[] = [];

  for (const field of fields) {
    const raw = response?.[field.key];
    // Answers are free text: pull the first number out of whatever the candidate typed
    // (e.g. "3 rows", "£1,204.50", "about 12") so wording never costs marks.
    const text = String(raw ?? "").trim();
    const value =
      typeof raw === "number"
        ? raw
        : parseFloat((text.replace(/[,\s]/g, "").match(/-?\d+(\.\d+)?/) ?? [""])[0]);

    if (!text) {
      criteria.push(
        criterion(field.label, ctx, 0, field.points, "Left blank — there was nothing to assess.", true),
      );
      continue;
    }

    const tolerance = field.tolerance ?? 0;
    const correct = Number.isFinite(value) && Math.abs(value - field.answer) <= tolerance;
    if (correct) {
      criteria.push(criterion(field.label, ctx, field.points, field.points, `You answered "${text}", which matches the expected value of ${field.answer}.`));
    } else {
      criteria.push(
        criterion(field.label, ctx, 0, field.points, `You answered "${text}"; the dataset gives ${field.answer}.`),
      );
      notes.push(`${field.label}: expected ${field.answer}, you answered ${Number.isFinite(value) ? value : "nothing usable"}.`);
    }
  }

  const feedback = notes.length
    ? `Some values were off. ${notes.join(" ")} Careful row-by-row inspection catches duplicates, sign errors and formatting issues before they reach a report.`
    : "Every value matched the expected answer. You spotted the data-quality issues and reconciled the totals correctly.";

  const evaluated = criteria.filter((c) => !c.cannot_evaluate);
  return {
    score: evaluated.reduce((s, c) => s + c.score, 0),
    max: evaluated.reduce((s, c) => s + c.max, 0),
    feedback,
    criteria,
  };
}

function gradeMultipleChoice(rubric: Rubric, response: Record<string, unknown>, ctx: { pillar: Pillar; tier: Tier }): Graded {
  const chosen = typeof response?.["choice"] === "number" ? (response["choice"] as number) : -1;
  const max = rubric.points ?? rubric.max_score ?? 10;

  if (chosen < 0) {
    const c = criterion("Interpretation", ctx, 0, max, "No option was selected.", true);
    return { score: 0, max: 0, feedback: "No response was submitted for this task.", criteria: [c] };
  }

  const correct = chosen === rubric.answer;
  const feedback = correct
    ? "Correct. You connected the change to the right underlying driver."
    : `Not quite. The strongest reading is: "${(rubric.options ?? [])[rubric.answer ?? 0]}".`;
  const c = criterion("Interpretation", ctx, correct ? max : 0, max, feedback);
  return { score: c.score, max, feedback, criteria: [c] };
}

async function gradeWritten(
  criteriaText: string[],
  max: number,
  brief: string,
  answer: string,
  ctx: { pillar: Pillar; tier: Tier },
  labelPrefix = "",
): Promise<Graded> {
  const list = (criteriaText ?? []).filter(Boolean);
  const perMax = list.length ? max / list.length : max;
  const label = (i: number) => `${labelPrefix}${list[i] ?? "Response quality"}`;
  const trimmed = (answer ?? "").trim();

  const allUnevaluable = (reason: string): Graded => ({
    score: 0,
    max: 0,
    feedback: reason,
    criteria: list.length
      ? list.map((_, i) => criterion(label(i), ctx, 0, perMax, reason, true))
      : [criterion(`${labelPrefix}Response quality`, ctx, 0, max, reason, true)],
  });

  if (trimmed.length < 3) {
    return allUnevaluable("Cannot evaluate — no substantive response was submitted for this criterion.");
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return allUnevaluable("Cannot evaluate — automated grading was unavailable, so this criterion was excluded from your score.");
  }

  const prompt = [
    "You are grading a hands-on job simulation task. Grade strictly but fairly, criterion by criterion.",
    "For SQL answers, judge the approach and logic — accept any reasonable equivalent formulation rather than matching one exact query.",
    "",
    `TASK BRIEF:\n${brief}`,
    "",
    `CRITERIA (index from 0):\n${list.map((c, i) => `${i}. ${c}`).join("\n")}`,
    "",
    `CANDIDATE RESPONSE:\n${trimmed}`,
    "",
    "For EACH criterion return a rating 0-100, a boolean cannot_evaluate, and a justification that quotes or cites specific evidence from the candidate's actual response.",
    "Set cannot_evaluate=true ONLY when the response contains genuinely no content bearing on that criterion (blank or far too short). An attempted but weak answer must be rated low, never marked cannot_evaluate.",
    `Respond with JSON only: {"criteria":[{"index":0,"rating":0,"cannot_evaluate":false,"justification":"..."}],"feedback":"<1-2 sentence overall summary>"}`,
  ].join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-3.5-flash",
      messages: [
        { role: "system", content: "You are a precise, fair, evidence-citing grader. Always reply with JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Grading is rate limited right now. Please retry in a moment.");
    if (res.status === 402) throw new Error("AI grading credits are exhausted for this workspace.");
    throw new Error(`Grading failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: { criteria?: Array<{ index?: number; rating?: number; cannot_evaluate?: boolean; justification?: string }>; feedback?: string } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  }

  const rows = Array.isArray(parsed.criteria) ? parsed.criteria : [];
  const sources = list.length ? list : ["Response quality"];
  const results: CriterionResult[] = sources.map((_, i) => {
    const row = rows.find((r) => Number(r?.index) === i) ?? rows[i];
    const cannot = Boolean(row?.cannot_evaluate);
    const rating = Math.max(0, Math.min(100, Number(row?.rating ?? 0)));
    const justification = String(row?.justification ?? (cannot ? "Insufficient content to assess this criterion." : "Graded against the rubric."));
    return criterion(label(i), ctx, cannot ? 0 : (rating / 100) * perMax, perMax, justification, cannot);
  });

  const evaluated = results.filter((c) => !c.cannot_evaluate);
  return {
    score: evaluated.reduce((s, c) => s + c.score, 0),
    max: evaluated.reduce((s, c) => s + c.max, 0),
    feedback: parsed.feedback ?? "Graded against the rubric.",
    criteria: results,
  };
}

/** Multi-stage case study stage: rule-graded numeric fields plus AI-graded written sub-answers. */
async function gradeCase(rubric: Rubric, brief: string, response: Record<string, unknown>, ctx: { pillar: Pillar; tier: Tier }): Promise<Graded> {
  const criteria: CriterionResult[] = [];
  const parts: string[] = [];

  if ((rubric.fields ?? []).length) {
    const structured = gradeStructured(rubric, response, ctx);
    criteria.push(...structured.criteria);
    parts.push(structured.feedback);
  }

  for (const question of rubric.written ?? []) {
    const answer = String(response[question.key] ?? "");
    const graded = await gradeWritten(
      question.criteria ?? [],
      question.points,
      [brief, "", `QUESTION: ${question.prompt}`].join("\n"),
      answer,
      ctx,
      `${question.label} — `,
    );
    criteria.push(...graded.criteria);
    parts.push(`${question.label} (${Math.round(graded.score)}/${Math.round(graded.max)}): ${graded.feedback}`);
  }

  const evaluated = criteria.filter((c) => !c.cannot_evaluate);
  return {
    score: evaluated.reduce((s, c) => s + c.score, 0),
    max: evaluated.reduce((s, c) => s + c.max, 0),
    feedback: parts.join("\n\n") || "No response was submitted for this stage.",
    criteria,
  };
}

export async function gradeAttempt(supabase: AnyClient, userId: string, attemptId: string) {
  const { data: attempt, error: attemptError } = await supabase
    .from("simulation_attempts")
    .select("id, user_id, simulation_id, status")
    .eq("id", attemptId)
    .maybeSingle();

  if (attemptError) throw new Error(attemptError.message);
  if (!attempt || attempt.user_id !== userId) throw new Error("Attempt not found");

  const { data: tasks, error: tasksError } = await supabase
    .from("simulation_tasks")
    .select("id, title, brief, task_type, rubric_criteria, order")
    .eq("simulation_id", attempt.simulation_id)
    .order("order", { ascending: true });
  if (tasksError) throw new Error(tasksError.message);

  const { data: results, error: resultsError } = await supabase
    .from("attempt_task_results")
    .select("id, task_id, response, score, max_score, criteria_breakdown")
    .eq("attempt_id", attemptId);
  if (resultsError) throw new Error(resultsError.message);

  const allCriteria: CriterionResult[] = [];

  for (const task of tasks ?? []) {
    const rubric = (task.rubric_criteria ?? {}) as Rubric;
    const max = rubric.max_score ?? 10;
    const ctx = stageScoring(rubric.stage_kind);

    const result = (results ?? []).find((r: any) => r.task_id === task.id);
    if (!result) continue;

    // Already graded in a previous run — reuse the stored breakdown.
    const stored = Array.isArray(result.criteria_breakdown) ? (result.criteria_breakdown as CriterionResult[]) : [];
    if (typeof result.score === "number" && stored.length) {
      allCriteria.push(...stored);
      continue;
    }

    const response = (result.response ?? {}) as Record<string, unknown>;
    let graded: Graded;

    if (task.task_type === "case") {
      graded = await gradeCase(rubric, task.brief, response, ctx);
    } else if (task.task_type === "structured") {
      graded = gradeStructured(rubric, response, ctx);
    } else if (task.task_type === "multiple_choice") {
      graded = gradeMultipleChoice(rubric, response, ctx);
    } else {
      graded = await gradeWritten(rubric.criteria ?? [], max, task.brief, String(response["text"] ?? ""), ctx);
    }

    allCriteria.push(...graded.criteria);

    const { error: updateError } = await supabase
      .from("attempt_task_results")
      .update({
        score: Math.round(graded.score),
        max_score: Math.max(1, Math.round(graded.max || max)),
        feedback: graded.feedback,
        criteria_breakdown: graded.criteria,
        pillar: ctx.pillar,
      })
      .eq("id", result.id);
    if (updateError) throw new Error(updateError.message);
  }

  const { overall, pillarScores } = rollUp(allCriteria);

  const { error: finishError } = await supabase
    .from("simulation_attempts")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      overall_score: overall,
      pillar_scores: pillarScores,
    })
    .eq("id", attemptId);
  if (finishError) throw new Error(finishError.message);

  return { overallScore: overall, pillarScores };
}
