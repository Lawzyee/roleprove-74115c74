import type { SupabaseClient } from "@supabase/supabase-js";

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


function gradeStructured(rubric: Rubric, response: Record<string, unknown>) {
  const fields = rubric.fields ?? [];
  let score = 0;
  const notes: string[] = [];

  for (const field of fields) {
    const raw = response?.[field.key];
    const value = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
    const tolerance = field.tolerance ?? 0;
    const correct = Number.isFinite(value) && Math.abs(value - field.answer) <= tolerance;
    if (correct) {
      score += field.points;
    } else {
      notes.push(`${field.label}: expected ${field.answer}, you answered ${Number.isFinite(value) ? value : "nothing"}.`);
    }
  }

  const feedback = notes.length
    ? `Some values were off. ${notes.join(" ")} Careful row-by-row inspection catches duplicates, sign errors and formatting issues before they reach a report.`
    : "Every value matched the expected answer. You spotted the duplicate, the negative amount and the non-ISO date, and reconciled the revenue total correctly.";

  return { score, feedback };
}

function gradeMultipleChoice(rubric: Rubric, response: Record<string, unknown>) {
  const chosen = typeof response?.["choice"] === "number" ? (response["choice"] as number) : -1;
  const correct = chosen === rubric.answer;
  const max = rubric.points ?? rubric.max_score ?? 10;
  return {
    score: correct ? max : 0,
    feedback: correct
      ? "Correct. You connected the revenue dip to the churn spike rather than to acquisition, which the signup trend rules out."
      : `Not quite. The strongest reading is: "${(rubric.options ?? [])[rubric.answer ?? 0]}" — signups were rising, so the drop has to come from retention, not acquisition.`,
  };
}

async function gradeWritten(
  criteria: string[],
  max: number,
  brief: string,
  answer: string,
): Promise<{ score: number; feedback: string }> {
  const trimmed = (answer ?? "").trim();
  if (!trimmed) {
    return { score: 0, feedback: "No response was submitted for this task." };
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return {
      score: Math.round(max * 0.5),
      feedback: "Automatic grading was unavailable for this task, so a provisional score was recorded.",
    };
  }

  const prompt = [
    "You are grading a hands-on job simulation task. Grade strictly but fairly against the rubric.",
    "For SQL answers, judge the approach and logic — accept any reasonable equivalent formulation rather than matching one exact query.",
    "",
    `TASK BRIEF:\n${brief}`,
    "",
    `RUBRIC CRITERIA (each equally weighted, total ${max} points):\n${(criteria ?? []).map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
    "",

    `CANDIDATE RESPONSE:\n${trimmed}`,
    "",
    `Respond with JSON only: {"score": <integer 0-${max}>, "feedback": "<1-2 sentences of specific, encouraging but honest feedback>"}`,
  ].join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3.5-flash",
      messages: [
        { role: "system", content: "You are a precise, fair grader. Always reply with JSON." },
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
  let parsed: { score?: number; feedback?: string } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  }

  const score = Math.max(0, Math.min(max, Math.round(Number(parsed.score ?? 0))));
  return { score, feedback: parsed.feedback ?? "Graded against the rubric." };
}

/** Multi-stage case study stage: rule-graded numeric fields plus AI-graded written sub-answers. */
async function gradeCase(rubric: Rubric, brief: string, response: Record<string, unknown>) {
  let score = 0;
  const parts: string[] = [];

  if ((rubric.fields ?? []).length) {
    const structured = gradeStructured(rubric, response);
    score += structured.score;
    parts.push(structured.feedback);
  }

  for (const question of rubric.written ?? []) {
    const answer = String(response[question.key] ?? "");
    const graded = await gradeWritten(
      question.criteria ?? [],
      question.points,
      [brief, "", `QUESTION: ${question.prompt}`].join("\n"),
      answer,
    );
    score += graded.score;
    parts.push(`${question.label} (${graded.score}/${question.points}): ${graded.feedback}`);
  }

  return { score, feedback: parts.join("\n\n") || "No response was submitted for this stage." };
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
    .select("id, task_id, response, score")
    .eq("attempt_id", attemptId);
  if (resultsError) throw new Error(resultsError.message);

  let totalScore = 0;
  let totalMax = 0;

  for (const task of tasks ?? []) {
    const rubric = (task.rubric_criteria ?? {}) as Rubric;
    const max = rubric.max_score ?? 10;
    totalMax += max;

    const result = (results ?? []).find((r: any) => r.task_id === task.id);
    if (!result) continue;

    if (typeof result.score === "number") {
      totalScore += result.score;
      continue;
    }

    const response = (result.response ?? {}) as Record<string, unknown>;
    let graded: { score: number; feedback: string };

    if (task.task_type === "case") {
      graded = await gradeCase(rubric, task.brief, response);
    } else if (task.task_type === "structured") {
      graded = gradeStructured(rubric, response);
    } else if (task.task_type === "multiple_choice") {
      graded = gradeMultipleChoice(rubric, response);
    } else {
      graded = await gradeWritten(rubric.criteria ?? [], max, task.brief, String(response["text"] ?? ""));
    }


    totalScore += graded.score;

    const { error: updateError } = await supabase
      .from("attempt_task_results")
      .update({ score: graded.score, max_score: max, feedback: graded.feedback })
      .eq("id", result.id);
    if (updateError) throw new Error(updateError.message);
  }

  const overall = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  const { error: finishError } = await supabase
    .from("simulation_attempts")
    .update({ status: "completed", completed_at: new Date().toISOString(), overall_score: overall })
    .eq("id", attemptId);
  if (finishError) throw new Error(finishError.message);

  return { overallScore: overall };
}
