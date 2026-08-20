import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Extracted = {
  role_type: string;
  seniority: string;
  skills: string[];
  responsibilities: string[];
  emphasis_themes: string[];
  company_context: string;
  confidence: number;
};

const DATA_ANALYST_KEYWORDS = [
  "data analyst",
  "analytics analyst",
  "business intelligence",
  "bi analyst",
  "insights analyst",
  "reporting analyst",
  "data analytics",
];

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
    throw new Error(`Analysis failed (${res.status}).`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Could not read the analysis result.");
  }
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function tryFetchText(target: string, headers: Record<string, string>) {
  try {
    const res = await fetch(target, { headers, redirect: "follow" });
    if (!res.ok) return null;
    const body = await res.text();
    const text = target.includes("r.jina.ai") ? body.replace(/\s+/g, " ").trim() : htmlToText(body);
    return wordCount(text) >= 50 ? text.slice(0, 12000) : null;
  } catch {
    return null;
  }
}

export async function fetchJobPostingText(url: string) {
  // Direct fetch first; many job boards block bots, so fall back to a reader proxy.
  const direct = await tryFetchText(url, BROWSER_HEADERS);
  if (direct) return direct;

  const proxied = await tryFetchText(`https://r.jina.ai/${url}`, { "User-Agent": BROWSER_HEADERS["User-Agent"] });
  if (proxied) return proxied;

  throw new Error(
    "That job site blocked us from reading the posting (LinkedIn, Indeed and similar often do). Please copy the job description text and paste it here instead.",
  );
}


export function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function extractJobPosting(text: string): Promise<Extracted> {
  const parsed = await callAi(
    "You extract structured data from job descriptions. Always reply with JSON only.",
    [
      "Extract the following from this job description and reply as JSON:",
      '{"role_type": "<canonical job role, e.g. Data Analyst>", "seniority": "<intern|junior|mid|senior|lead|unclear>", "skills": ["..."], "responsibilities": ["..."], "emphasis_themes": ["<3-5 specific domains this posting emphasises, e.g. membership and retention metrics, EPOS data validation, Power BI dashboards, statistical reasoning, non-technical stakeholder communication>"], "company_context": "<1-2 sentences on the company/team/domain, or empty string>", "confidence": <0-1 how confident you are in role_type>}',
      "",
      "JOB DESCRIPTION:",
      text.slice(0, 12000),
    ].join("\n"),
  );

  return {
    role_type: String(parsed.role_type ?? "").trim(),
    seniority: String(parsed.seniority ?? "unclear").trim(),
    skills: Array.isArray(parsed.skills) ? parsed.skills.map(String).slice(0, 20) : [],
    responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities.map(String).slice(0, 20) : [],
    emphasis_themes: Array.isArray(parsed.emphasis_themes) ? parsed.emphasis_themes.map(String).slice(0, 5) : [],
    company_context: String(parsed.company_context ?? ""),
    confidence: Number(parsed.confidence ?? 0),
  };
}

export function matchesDataAnalyst(extracted: Extracted) {
  const role = extracted.role_type.toLowerCase();
  const keywordHit = DATA_ANALYST_KEYWORDS.some((k) => role.includes(k));
  return keywordHit && extracted.confidence >= 0.5;
}

async function personaliseBriefs(
  extracted: Extracted,
  tasks: Array<{ id: string; title: string; brief: string; task_type: string }>,
) {
  const parsed = await callAi(
    "You rewrite job-simulation scenario text so it reflects a specific job posting. Never change the underlying data, numbers, answer options or what is being asked — only the framing, company context and emphasis. Reply with JSON only.",
    [
      `JOB POSTING CONTEXT:\nRole: ${extracted.role_type}\nSeniority: ${extracted.seniority}\nCompany context: ${extracted.company_context}\nSkills/tools: ${extracted.skills.join(", ")}\nResponsibilities: ${extracted.responsibilities.join("; ")}`,
      "",
      "TASKS TO REFRAME (keep every number, dataset row, option and required output identical):",
      JSON.stringify(tasks.map((t) => ({ id: t.id, title: t.title, brief: t.brief }))),
      "",
      'Reply as JSON: {"tasks": [{"id": "<same id>", "brief": "<rewritten brief>"}], "title": "<short simulation title referencing the role/company>", "description": "<1-2 sentence description of this personalised simulation>"}',
    ].join("\n"),
  );

  const map = new Map<string, string>();
  for (const t of parsed.tasks ?? []) {
    if (t?.id && typeof t.brief === "string" && t.brief.trim()) map.set(String(t.id), t.brief.trim());
  }
  return {
    briefs: map,
    title: String(parsed.title ?? "").trim(),
    description: String(parsed.description ?? "").trim(),
  };
}

export async function generatePersonalisedSimulation(
  userId: string,
  input: { text?: string; url?: string },
) {
  const sourceUrl = input.url?.trim() || null;
  let rawText = (input.text ?? "").trim();
  if (!rawText && sourceUrl) rawText = await fetchJobPostingText(sourceUrl);

  if (wordCount(rawText) < 50) {
    return {
      outcome: "too_vague" as const,
      message:
        "That's not enough detail to work with. Paste the full job description — responsibilities, required skills and tools — and we'll tailor a simulation to it.",
    };
  }

  const extracted = await extractJobPosting(rawText);
  const matched = matchesDataAnalyst(extracted);

  const { data: posting, error: postingError } = await supabaseAdmin
    .from("job_postings")
    .insert({
      user_id: userId,
      raw_text: rawText.slice(0, 20000),
      source_url: sourceUrl,
      extracted_role_type: extracted.role_type,
      extracted_seniority: extracted.seniority,
      extracted_skills: extracted.skills,
      extracted_responsibilities: extracted.responsibilities,
      company_context: extracted.company_context,
      matched,
    } as any)
    .select("id")
    .single();
  if (postingError) throw new Error(postingError.message);

  if (!matched) {
    return {
      outcome: "no_match" as const,
      roleType: extracted.role_type || "this role",
      jobPostingId: posting.id,
    };
  }

  const { data: baseSim, error: baseError } = await supabaseAdmin
    .from("simulations")
    .select("id, title, description, estimated_minutes, role_id")
    .eq("is_personalized", false)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (baseError) throw new Error(baseError.message);
  if (!baseSim) throw new Error("The base Data Analyst simulation is unavailable.");

  const { data: baseTasks, error: taskError } = await supabaseAdmin
    .from("simulation_tasks")
    .select("id, title, brief, task_type, rubric_criteria, order")
    .eq("simulation_id", baseSim.id)
    .order("order");
  if (taskError) throw new Error(taskError.message);
  if (!baseTasks?.length) throw new Error("The base simulation has no tasks.");

  const personalised = await personaliseBriefs(extracted, baseTasks as any);

  const { data: newSim, error: simError } = await supabaseAdmin
    .from("simulations")
    .insert({
      role_id: baseSim.role_id,
      title: personalised.title || `${extracted.role_type} — tailored simulation`,
      description:
        personalised.description ||
        `A Data Analyst simulation reframed around the job description you pasted for ${extracted.role_type}.`,
      estimated_minutes: baseSim.estimated_minutes,
      is_personalized: true,
      owner_user_id: userId,
      source_simulation_id: baseSim.id,
    } as any)
    .select("id")
    .single();
  if (simError) throw new Error(simError.message);

  const { error: insertTasksError } = await supabaseAdmin.from("simulation_tasks").insert(
    (baseTasks as any[]).map((t) => ({
      simulation_id: newSim.id,
      title: t.title,
      brief: personalised.briefs.get(t.id) ?? t.brief,
      task_type: t.task_type,
      rubric_criteria: t.rubric_criteria,
      order: t.order,
    })),
  );
  if (insertTasksError) throw new Error(insertTasksError.message);

  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from("simulation_attempts")
    .insert({
      user_id: userId,
      simulation_id: newSim.id,
      job_posting_id: posting.id,
      simulation_type: "jd_matched",
    } as any)
    .select("id")
    .single();
  if (attemptError) throw new Error(attemptError.message);

  return {
    outcome: "matched" as const,
    attemptId: attempt.id as string,
    simulationId: newSim.id as string,
    roleType: extracted.role_type,
    skills: extracted.skills.slice(0, 8),
  };
}
