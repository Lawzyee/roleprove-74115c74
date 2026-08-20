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

type GenRow = { ref: string; entity: string; category: string; amount: string; date: string };

type GeneratedTasks = {
  title: string;
  description: string;
  tasks: Array<{
    title: string;
    brief: string;
    task_type: "structured" | "text" | "multiple_choice";
    rubric_criteria: Record<string, unknown>;
  }>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isBlank(value: string) {
  const v = (value ?? "").trim().toLowerCase();
  return !v || v === "(blank)" || v === "n/a" || v === "null" || v === "-";
}

function parseAmount(value: string) {
  const n = Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** Recomputes the answer key directly from the generated table. */
export function computeAnswerKey(rows: GenRow[]) {
  const seen = new Set<string>();
  let duplicates = 0;
  let invalidAmounts = 0;
  let badDates = 0;
  let total = 0;

  for (const row of rows) {
    const fingerprint = [row.ref, row.entity, row.category, row.amount, row.date].map((v) => String(v ?? "").trim()).join("|");
    if (seen.has(fingerprint)) {
      duplicates += 1;
      continue;
    }
    seen.add(fingerprint);

    const amount = parseAmount(row.amount);
    const amountInvalid = !Number.isFinite(amount) || amount < 0;
    if (amountInvalid) invalidAmounts += 1;
    if (!ISO_DATE.test(String(row.date ?? "").trim())) badDates += 1;
    if (!amountInvalid && !isBlank(row.entity)) total += amount;
  }

  return {
    duplicates,
    invalid_amounts: invalidAmounts,
    bad_dates: badDates,
    total_amount: Math.round(total * 100) / 100,
  };
}

function renderTable(columns: Record<keyof GenRow, string>, rows: GenRow[]) {
  const order: Array<keyof GenRow> = ["ref", "entity", "category", "amount", "date"];
  const widths = order.map((k) =>
    Math.max(columns[k].length, ...rows.map((r) => String(r[k] ?? "").length)),
  );
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join(" | ").trimEnd();
  return [line(order.map((k) => columns[k])), ...rows.map((r) => line(order.map((k) => String(r[k] ?? ""))))].join("\n");
}

export async function generateThemedTasks(extracted: Extracted): Promise<GeneratedTasks> {
  const themes = extracted.emphasis_themes.length
    ? extracted.emphasis_themes
    : extracted.skills.slice(0, 5);

  const parsed = await callAi(
    "You design hands-on job-simulation content for a Data Analyst assessment. Every generation must be original: new company/entity names, new row values, new dates and new numbers. Reply with JSON only.",
    [
      `JOB POSTING CONTEXT:\nRole: ${extracted.role_type}\nSeniority: ${extracted.seniority}\nCompany context: ${extracted.company_context}\nSkills/tools: ${extracted.skills.join(", ")}\nResponsibilities: ${extracted.responsibilities.join("; ")}\nEMPHASIS THEMES (must visibly shape the task content): ${themes.join("; ")}`,
      "",
      `Randomisation seed (make the data unique to this seed): ${Math.random().toString(36).slice(2)}-${Date.now()}`,
      "",
      "Design a 4-task simulation themed to the emphasis themes above:",
      "1. A data-cleaning task over a small messy export (10-14 rows) drawn from the domain the posting emphasises (e.g. membership/retention feeds, EPOS transactions). Deliberately include: 1-3 exact duplicate rows, 1-2 rows with a negative or non-numeric amount, 1-3 rows with a date that is NOT in YYYY-MM-DD format, and 1 row with a missing/blank entity value.",
      "2. A SQL task whose question reflects the emphasis themes (e.g. churn/retention cohorts) rather than generic revenue aggregation.",
      "3. A multiple-choice chart-interpretation task presenting a trend from the emphasised domain, with 4 plausible options and exactly one best answer.",
      "4. A stakeholder-summary writing task naming the actual audiences from the posting.",
      "",
      "Reply as JSON exactly in this shape:",
      JSON.stringify({
        title: "<short simulation title referencing the role/company>",
        description: "<1-2 sentence description>",
        cleaning: {
          title: "<task title>",
          brief_intro: "<scenario framing, 2-4 sentences, no table>",
          question: "<what to count and total, referencing the column labels>",
          columns: { ref: "record_id", entity: "member", category: "plan", amount: "amount", date: "joined_date" },
          rows: [{ ref: "1001", entity: "…", category: "…", amount: "240.00", date: "2025-03-04" }],
          amount_label: "Total valid revenue (GBP)",
          answer_key: { duplicates: 0, invalid_amounts: 0, bad_dates: 0, total_amount: 0 },
        },
        sql: { title: "<task title>", brief: "<brief incl. table schema>", criteria: ["…", "…", "…", "…", "…"] },
        chart: { title: "<task title>", brief: "<chart figures + question>", options: ["…", "…", "…", "…"], answer: 1 },
        summary: { title: "<task title>", brief: "<brief naming the real stakeholders>", criteria: ["…", "…", "…", "…", "…"] },
      }),
      "",
      "answer_key MUST be computed from the rows you generated: duplicates = number of extra exact-duplicate rows, invalid_amounts = unique rows with a negative or non-numeric amount, bad_dates = unique rows whose date is not YYYY-MM-DD, total_amount = sum of amounts over unique rows excluding negative/invalid amounts and rows with a blank entity.",
    ].join("\n"),
  );

  const c = parsed.cleaning ?? {};
  const rows: GenRow[] = (Array.isArray(c.rows) ? c.rows : []).map((r: any) => ({
    ref: String(r?.ref ?? ""),
    entity: String(r?.entity ?? ""),
    category: String(r?.category ?? ""),
    amount: String(r?.amount ?? ""),
    date: String(r?.date ?? ""),
  }));
  if (rows.length < 6) throw new Error("Generated dataset was too small.");

  const columns = {
    ref: String(c.columns?.ref ?? "record_id"),
    entity: String(c.columns?.entity ?? "entity"),
    category: String(c.columns?.category ?? "category"),
    amount: String(c.columns?.amount ?? "amount"),
    date: String(c.columns?.date ?? "date"),
  };

  const computed = computeAnswerKey(rows);
  const claimed = c.answer_key ?? {};

  // Sanity check: the AI's key must agree with the dataset it just produced.
  const consistent =
    Number(claimed.duplicates) === computed.duplicates &&
    Number(claimed.invalid_amounts) === computed.invalid_amounts &&
    Number(claimed.bad_dates) === computed.bad_dates &&
    Math.abs(Number(claimed.total_amount) - computed.total_amount) <= 1;
  if (!consistent) {
    console.warn("[jd] answer key mismatch", { claimed, computed });
    throw new Error("Generated answer key did not match the generated dataset.");
  }
  if (computed.duplicates < 1 || computed.invalid_amounts < 1 || computed.bad_dates < 1) {
    throw new Error("Generated dataset did not contain the required data-quality issues.");
  }

  const chart = parsed.chart ?? {};
  const chartOptions = (Array.isArray(chart.options) ? chart.options : []).map(String).slice(0, 4);
  const chartAnswer = Number(chart.answer);
  if (chartOptions.length !== 4 || !Number.isInteger(chartAnswer) || chartAnswer < 0 || chartAnswer > 3) {
    throw new Error("Generated chart-interpretation task was invalid.");
  }

  const sqlCriteria = (Array.isArray(parsed.sql?.criteria) ? parsed.sql.criteria : []).map(String);
  const summaryCriteria = (Array.isArray(parsed.summary?.criteria) ? parsed.summary.criteria : []).map(String);
  if (sqlCriteria.length < 3 || summaryCriteria.length < 3) throw new Error("Generated rubrics were incomplete.");
  if (!String(parsed.sql?.brief ?? "").trim() || !String(parsed.summary?.brief ?? "").trim()) {
    throw new Error("Generated task briefs were incomplete.");
  }

  return {
    title: String(parsed.title ?? "").trim(),
    description: String(parsed.description ?? "").trim(),
    tasks: [
      {
        title: String(c.title ?? "Data cleaning").trim(),
        brief: [String(c.brief_intro ?? "").trim(), "", renderTable(columns, rows), "", String(c.question ?? "").trim()]
          .join("\n")
          .trim(),
        task_type: "structured",
        rubric_criteria: {
          max_score: 10,
          fields: [
            { key: "duplicates", label: "Duplicate rows to remove", answer: computed.duplicates, points: 2 },
            {
              key: "invalid_amounts",
              label: "Rows with an invalid/negative amount",
              answer: computed.invalid_amounts,
              points: 2,
            },
            { key: "bad_dates", label: "Rows with a non-ISO date format", answer: computed.bad_dates, points: 2 },
            {
              key: "total_amount",
              label: String(c.amount_label ?? "Total valid amount"),
              answer: computed.total_amount,
              points: 4,
              tolerance: 1,
            },
          ],
        },
      },
      {
        title: String(parsed.sql?.title ?? "SQL query").trim(),
        brief: String(parsed.sql.brief).trim(),
        task_type: "text",
        rubric_criteria: { max_score: 10, criteria: sqlCriteria.slice(0, 6) },
      },
      {
        title: String(chart.title ?? "Chart interpretation").trim(),
        brief: String(chart.brief ?? "").trim(),
        task_type: "multiple_choice",
        rubric_criteria: { max_score: 10, points: 10, options: chartOptions, answer: chartAnswer },
      },
      {
        title: String(parsed.summary?.title ?? "Stakeholder summary").trim(),
        brief: String(parsed.summary.brief).trim(),
        task_type: "text",
        rubric_criteria: { max_score: 10, criteria: summaryCriteria.slice(0, 6) },
      },
    ],
  };
}

async function generateThemedTasksWithRetry(extracted: Extracted): Promise<GeneratedTasks> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await generateThemedTasks(extracted);
    } catch (error) {
      lastError = error;
    }
  }
  console.error("[jd] personalised generation failed", lastError);
  throw new Error("We couldn't build a reliable tailored simulation just now. Please try again in a moment.");
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

  const personalised = await generateThemedTasksWithRetry(extracted);

  const { data: newSim, error: simError } = await supabaseAdmin
    .from("simulations")
    .insert({
      role_id: baseSim.role_id,
      title: personalised.title || `${extracted.role_type} — tailored simulation`,
      description:
        personalised.description ||
        `A Data Analyst simulation generated around the job description you pasted for ${extracted.role_type}.`,
      estimated_minutes: baseSim.estimated_minutes,
      is_personalized: true,
      owner_user_id: userId,
      source_simulation_id: baseSim.id,
    } as any)
    .select("id")
    .single();
  if (simError) throw new Error(simError.message);

  const { error: insertTasksError } = await supabaseAdmin.from("simulation_tasks").insert(
    personalised.tasks.map((t, i) => ({
      simulation_id: newSim.id,
      title: t.title,
      brief: t.brief,
      task_type: t.task_type,
      rubric_criteria: t.rubric_criteria,
      order: i + 1,
    })) as any,
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
