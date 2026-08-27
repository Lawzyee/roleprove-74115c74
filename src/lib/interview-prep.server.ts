import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractJobPosting, fetchJobPostingText, wordCount } from "./jd.server";
import { extractCvText } from "./interview-prep-cv.server";
import { toPillar } from "./interview-prep";
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




export async function createPrepSession(
  userId: string,
  input: { text?: string; url?: string; cvFilePath?: string },
) {
  const sourceUrl = input.url?.trim() || null;
  let text = input.text?.trim() ?? "";
  if (!text && sourceUrl) text = await fetchJobPostingText(sourceUrl);

  if (wordCount(text) < 40) {
    return {
      outcome: "too_vague" as const,
      message: "That posting was too short to work with. Paste the full job description text (around 50+ words).",
    };
  }

  const cvFilePath = input.cvFilePath?.trim() || null;
  const cvText = cvFilePath ? await extractCvText(cvFilePath) : "";

  const extracted = await extractJobPosting(text);

  const pillarBriefs: Record<PrepCategory, string> = {
    can_do_job:
      "role-specific/technical ability, grounded in the posting's actual tools, systems and responsibilities",
    solve_problems:
      "situational judgement — realistic hypothetical scenarios for this role and how they would handle them",
    work_with_others: "behaviour, communication, collaboration and stakeholder management",
    can_trust: "ownership, accountability, integrity — mistakes, difficult trade-offs, professional judgement",
    will_grow: "motivation, learning agility, culture and values fit",
  };

  const pillarOrder: PrepCategory[] = [
    "can_do_job",
    "solve_problems",
    "work_with_others",
    "can_trust",
    "will_grow",
  ];

  const jobContext = [
    `ROLE: ${extracted.role_type} (${extracted.seniority})`,
    `SKILLS: ${extracted.skills.join(", ")}`,
    `RESPONSIBILITIES: ${extracted.responsibilities.join(" | ")}`,
    `EMPHASIS: ${extracted.emphasis_themes.join(", ")}`,
    `COMPANY CONTEXT: ${extracted.company_context}`,
    "",
    "JOB DESCRIPTION:",
    text.slice(0, 10000),
    ...(cvText ? ["", "CANDIDATE CV:", cvText.slice(0, 8000)] : []),
  ].join("\n");

  async function generatePillar(pillar: PrepCategory) {
    const result = await callAi(
      "You are an experienced hiring manager who writes interview questions. Always reply with JSON only.",
      [
        `Write the interview questions this candidate is genuinely likely to be asked for THIS specific job, for one pillar only: "${pillar}" — ${pillarBriefs[pillar]}.`,
        "",
        "Rules:",
        "- Write exactly 5 questions for this pillar. Each must cover a different responsibility, tool, scenario or theme — no repetition or filler that could apply to any candidate.",
        "- Reference the actual responsibilities, tools, domain language and company context from the posting. Never write a generic question with the company name swapped in.",
        "- Each question is one clear question a human would actually ask out loud.",
        ...(cvText
          ? [
              "- A CV is provided. Reference specific real details from the CV (named projects, employers, achievements) where natural. Never invent details that are not in the CV.",
              "- Where the job description requires skills/tools the CV never mentions, include at least one question probing that gap, e.g. \"The role requires strong SQL, which isn't mentioned on your CV — how would you describe your experience with it?\".",
            ]
          : []),
        "",
        'Reply as JSON: {"questions": [{"question_text": "..."}]}',
        "",
        jobContext,
      ].join("\n"),
    );
    const raw: Array<{ question_text?: string }> = Array.isArray(result.questions) ? result.questions : [];
    return raw
      .map((q) => ({ category: pillar, question_text: String(q.question_text ?? "").trim() }))
      .filter((q) => q.question_text.length > 10)
      .slice(0, 5);
  }

  const perPillar = await Promise.all(pillarOrder.map((p) => generatePillar(p).catch(() => [])));
  const questions = perPillar.flat();

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
      cv_file_path: cvFilePath,
      cv_extracted_text: cvText || null,
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
