import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractJobPosting, fetchJobPostingText, wordCount } from "./jd.server";

import type { PrepCategory } from "./interview-prep";

function apiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this workspace.");
  return key;
}

async function callAi(system: string, user: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      model: "google/gemini-3.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("Too many requests right now — please retry in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    throw new Error(`Request failed (${res.status}).`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Could not read the AI response.");
  }
}

function normaliseCategory(value: unknown): PrepCategory {
  const v = String(value ?? "").toLowerCase();
  if (v.startsWith("behav")) return "behavioral";
  if (v.startsWith("cult") || v.includes("value")) return "culture";
  return "technical";
}

export async function createPrepSession(userId: string, input: { text?: string; url?: string }) {
  const sourceUrl = input.url?.trim() || null;
  let text = input.text?.trim() ?? "";
  if (!text && sourceUrl) text = await fetchJobPostingText(sourceUrl);

  if (wordCount(text) < 40) {
    return {
      outcome: "too_vague" as const,
      message: "That posting was too short to work with. Paste the full job description text (around 50+ words).",
    };
  }

  const extracted = await extractJobPosting(text);

  const generated = await callAi(
    "You are an experienced hiring manager who writes interview questions. Always reply with JSON only.",
    [
      "Write 10 interview questions this candidate is genuinely likely to be asked for THIS specific job.",
      "Rules:",
      "- Reference the actual responsibilities, tools, domain language and company context from the posting. Never write a generic question with the company name swapped in.",
      "- 4 behavioral, 4 technical (role-specific, naming the specific tools/skills in the posting), 2 culture.",
      "- Each question is one clear question a human would actually ask out loud.",
      "",
      'Reply as JSON: {"questions": [{"category": "behavioral|technical|culture", "question_text": "..."}]}',
      "",
      `ROLE: ${extracted.role_type} (${extracted.seniority})`,
      `SKILLS: ${extracted.skills.join(", ")}`,
      `RESPONSIBILITIES: ${extracted.responsibilities.join(" | ")}`,
      `EMPHASIS: ${extracted.emphasis_themes.join(", ")}`,
      `COMPANY CONTEXT: ${extracted.company_context}`,
      "",
      "JOB DESCRIPTION:",
      text.slice(0, 10000),
    ].join("\n"),
  );

  const rawQuestions: Array<{ category?: string; question_text?: string }> = Array.isArray(generated.questions)
    ? generated.questions
    : [];
  const questions = rawQuestions
    .map((q) => ({ category: normaliseCategory(q.category), question_text: String(q.question_text ?? "").trim() }))
    .filter((q) => q.question_text.length > 10)
    .slice(0, 12);

  if (questions.length < 3) throw new Error("We couldn't generate questions for that posting. Please try again.");

  const title = extracted.role_type
    ? `${extracted.role_type}${extracted.company_context ? ` — ${extracted.company_context.split(/[.\n]/)[0]!.slice(0, 60)}` : ""}`
    : "Interview prep";

  const { data: session, error } = await supabaseAdmin
    .from("interview_prep_sessions")
    .insert({
      user_id: userId,
      title,
      source_jd_text: text.slice(0, 20000),
      source_url: sourceUrl,
      extracted_role_context: extracted as unknown as never,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: qErr } = await supabaseAdmin.from("interview_prep_questions").insert(
    questions.map((q, i) => ({
      session_id: session.id,
      category: q.category,
      question_text: q.question_text,
      order_index: i,
    })),
  );
  if (qErr) throw qErr;

  return { outcome: "ready" as const, sessionId: session.id as string };
}

export async function gradePrepAnswer(userId: string, questionId: string, responseText: string) {
  const { data: question, error } = await supabaseAdmin
    .from("interview_prep_questions")
    .select("id, category, question_text, interview_prep_sessions!inner(id, user_id, extracted_role_context)")
    .eq("id", questionId)
    .single();
  if (error) throw error;

  const session = (question as any).interview_prep_sessions;
  if (!session || session.user_id !== userId) throw new Error("Not found.");

  const answer = responseText.trim();
  let feedback_text: string;
  let rubric_scores: { evaluated: boolean; structure?: number; specificity?: number; relevance?: number };

  if (wordCount(answer) < 25) {
    feedback_text =
      "Not enough to evaluate — write a fuller answer (aim for a specific situation, what you did, and the outcome) and resubmit.";
    rubric_scores = { evaluated: false };
  } else {
    const ctx = session.extracted_role_context ?? {};
    const graded = await callAi(
      "You are an interview coach giving short, evidence-based feedback. Always reply with JSON only.",
      [
        "Score this interview answer out of 5 on each of: structure, specificity, relevance.",
        "Quote or paraphrase the candidate's actual words as evidence in the feedback. Be concise (max 120 words) and give one concrete improvement.",
        'Reply as JSON: {"structure": <0-5>, "specificity": <0-5>, "relevance": <0-5>, "feedback": "..."}',
        "",
        `QUESTION (${question.category}): ${question.question_text}`,
        `JOB PRIORITIES: ${[...((ctx.responsibilities as string[]) ?? []), ...((ctx.emphasis_themes as string[]) ?? [])].join(" | ")}`,
        "",
        "CANDIDATE ANSWER:",
        answer.slice(0, 6000),
      ].join("\n"),
    );

    const clamp = (v: unknown) => Math.max(0, Math.min(5, Math.round(Number(v) || 0)));
    rubric_scores = {
      evaluated: true,
      structure: clamp(graded.structure),
      specificity: clamp(graded.specificity),
      relevance: clamp(graded.relevance),
    };
    feedback_text = String(graded.feedback ?? "").trim() || "No feedback available.";
  }

  const { error: upErr } = await supabaseAdmin
    .from("interview_prep_responses")
    .upsert(
      {
        question_id: questionId,
        response_text: answer,
        feedback_text,
        rubric_scores: rubric_scores as unknown as never,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "question_id" },
    );
  if (upErr) throw upErr;

  return { feedback_text, rubric_scores };
}
