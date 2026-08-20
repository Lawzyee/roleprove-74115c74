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

export type DatasetColumn = { key: string; label: string };
export type DatasetRow = Record<string, string>;
export type Dataset = { name: string; columns: DatasetColumn[]; rows: DatasetRow[] };

type Metric =
  | { kind: "duplicate_rows" }
  | { kind: "invalid_number"; column: string }
  | { kind: "bad_date_format"; column: string }
  | { kind: "missing_values"; column: string }
  | { kind: "inconsistent_labels"; column: string; allowed_values: string[] }
  | { kind: "sum_valid"; column: string }
  | { kind: "distinct_count"; column: string };

type AnswerField = {
  key: string;
  label: string;
  type: "number";
  metric: Metric;
  points: number;
  tolerance?: number;
  answer: number;
};

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

function isBlank(value: unknown) {
  const v = String(value ?? "").trim().toLowerCase();
  return !v || v === "(blank)" || v === "n/a" || v === "null" || v === "-";
}

function parseAmount(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || !/\d/.test(raw)) return NaN;
  const n = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function fingerprint(columns: DatasetColumn[], row: DatasetRow) {
  return columns.map((c) => String(row[c.key] ?? "").trim().toLowerCase()).join("|");
}

function uniqueRows(dataset: Dataset) {
  const seen = new Set<string>();
  const out: DatasetRow[] = [];
  for (const row of dataset.rows) {
    const fp = fingerprint(dataset.columns, row);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(row);
  }
  return out;
}

/** Recomputes a single metric server-side, directly from the generated dataset. */
export function computeMetric(dataset: Dataset, metric: Metric): number {
  const unique = uniqueRows(dataset);
  const columnKeys = new Set(dataset.columns.map((c) => c.key));
  const col = (metric as { column?: string }).column;
  if (metric.kind !== "duplicate_rows") {
    if (!col || !columnKeys.has(col)) throw new Error(`Metric references unknown column "${col}".`);
  }

  switch (metric.kind) {
    case "duplicate_rows":
      return dataset.rows.length - unique.length;
    case "invalid_number":
      return unique.filter((r) => {
        const n = parseAmount(r[col!]);
        return !Number.isFinite(n) || n < 0;
      }).length;
    case "bad_date_format":
      return unique.filter((r) => !ISO_DATE.test(String(r[col!] ?? "").trim())).length;
    case "missing_values":
      return unique.filter((r) => isBlank(r[col!])).length;
    case "inconsistent_labels": {
      const allowed = (metric.allowed_values ?? []).map((v) => String(v).trim().toLowerCase());
      if (allowed.length < 2) throw new Error("inconsistent_labels needs at least two allowed values.");
      return unique.filter((r) => {
        const v = String(r[col!] ?? "").trim().toLowerCase();
        return !!v && !allowed.includes(v);
      }).length;
    }
    case "sum_valid": {
      const total = unique.reduce((sum, r) => {
        const n = parseAmount(r[col!]);
        return Number.isFinite(n) && n >= 0 ? sum + n : sum;
      }, 0);
      return Math.round(total * 100) / 100;
    }
    case "distinct_count": {
      const values = new Set(
        unique.map((r) => String(r[col!] ?? "").trim().toLowerCase()).filter((v) => v && !isBlank(v)),
      );
      return values.size;
    }
    default:
      throw new Error("Unsupported metric kind.");
  }
}

export function datasetToCsv(dataset: Dataset) {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = dataset.columns.map((c) => esc(c.key)).join(",");
  const body = dataset.rows.map((r) => dataset.columns.map((c) => esc(r[c.key])).join(","));
  return [header, ...body].join("\n");
}


const METRIC_KINDS = [
  "duplicate_rows",
  "invalid_number",
  "bad_date_format",
  "missing_values",
  "inconsistent_labels",
  "sum_valid",
  "distinct_count",
];

export async function generateThemedTasks(extracted: Extracted): Promise<GeneratedTasks> {
  const themes = extracted.emphasis_themes.length ? extracted.emphasis_themes : extracted.skills.slice(0, 5);

  const parsed = await callAi(
    "You design hands-on job-simulation content for a Data Analyst assessment. Every generation must be original: a freshly designed table structure, new company/entity names, new row values, new dates and new numbers. Reply with JSON only.",
    [
      `JOB POSTING CONTEXT:\nRole: ${extracted.role_type}\nSeniority: ${extracted.seniority}\nCompany context: ${extracted.company_context}\nSkills/tools: ${extracted.skills.join(", ")}\nResponsibilities: ${extracted.responsibilities.join("; ")}\nEMPHASIS THEMES (must visibly shape the dataset itself, not just the wording): ${themes.join("; ")}`,
      "",
      `Randomisation seed (make the data unique to this seed): ${Math.random().toString(36).slice(2)}-${Date.now()}`,
      "",
      "CRITICAL: Do not reuse or lightly modify any generic template table (id / customer / plan / amount / date). Design the dataset from scratch as if it were an actual export from the systems this job description names, for the business problem it describes. Choose the number of columns (4-7), the column names, the grain of a row, and which data-quality problems are realistic in that specific feed.",
      "",
      "Design a 4-task simulation:",
      "1. DATA CLEANING over a messy export of 10-16 rows in the domain the posting emphasises. Introduce 2-4 different categories of data-quality problem chosen to fit this domain (not always the same three).",
      "2. SQL task whose question reflects the emphasis themes and queries the SAME table you designed (reference its real column names).",
      "3. Multiple-choice chart-interpretation task from the emphasised domain, 4 plausible options, exactly one best answer.",
      "4. Stakeholder-summary writing task naming the real audiences from the posting.",
      "",
      "Reply as JSON exactly in this shape:",
      JSON.stringify({
        title: "<short simulation title referencing the role/company>",
        description: "<1-2 sentence description>",
        cleaning: {
          title: "<task title>",
          brief_intro: "<scenario framing, 2-4 sentences, no table>",
          question_text: "<the question, referencing your real column names>",
          dataset: {
            name: "<snake_case file/table name>",
            columns: [{ key: "<snake_case column>", label: "<human label>" }],
            rows: [{ "<column key>": "<value as string>" }],
          },
          answer_fields: [
            {
              key: "<snake_case answer key>",
              label: "<what the candidate must enter>",
              type: "number",
              metric: { kind: `<one of ${METRIC_KINDS.join(" | ")}>`, column: "<column key, omit for duplicate_rows>", allowed_values: ["<only for inconsistent_labels>"] },
              expected: 0,
            },
          ],
        },
        sql: {
          title: "<task title>",
          brief: "<brief including the schema of the dataset table you designed>",
          prompt_label: "<label for the answer box, e.g. Your SQL query>",
          criteria: ["…", "…", "…", "…", "…"],
        },
        chart: { title: "<task title>", brief: "<chart figures + question>", options: ["…", "…", "…", "…"], answer: 1 },
        summary: {
          title: "<task title>",
          brief: "<brief naming the real stakeholders>",
          prompt_label: "<label for the answer box>",
          criteria: ["…", "…", "…", "…", "…"],
        },
      }),
      "",
      "Rules for answer_fields: 3 to 5 fields, every field must be answerable purely by inspecting the dataset, and 'expected' must be the exact value computed from the rows you generated. Metric semantics (all computed over rows after removing exact duplicates): duplicate_rows = number of extra exact-duplicate rows; invalid_number = rows whose value in that column is negative or non-numeric; bad_date_format = rows whose date is not YYYY-MM-DD; missing_values = rows with a blank value; inconsistent_labels = rows whose value is not in allowed_values; sum_valid = sum of that numeric column over rows with a valid non-negative value; distinct_count = number of distinct non-blank values.",
      "Use at least 3 different metric kinds, including at least one counting metric whose expected value is greater than zero and at least one sum_valid or distinct_count metric.",
    ].join("\n"),
  );

  const c = parsed.cleaning ?? {};
  const rawDataset = c.dataset ?? {};
  const columns: DatasetColumn[] = (Array.isArray(rawDataset.columns) ? rawDataset.columns : [])
    .map((col: any) => ({ key: String(col?.key ?? "").trim(), label: String(col?.label ?? col?.key ?? "").trim() }))
    .filter((col: DatasetColumn) => !!col.key);
  const rows: DatasetRow[] = (Array.isArray(rawDataset.rows) ? rawDataset.rows : []).map((r: any) => {
    const row: DatasetRow = {};
    for (const col of columns) row[col.key] = r?.[col.key] === undefined || r?.[col.key] === null ? "" : String(r[col.key]);
    return row;
  });

  if (columns.length < 4) throw new Error("Generated dataset had too few columns.");
  if (rows.length < 8) throw new Error("Generated dataset was too small.");

  const dataset: Dataset = {
    name: String(rawDataset.name ?? "dataset").trim().replace(/[^a-z0-9_\-]/gi, "_").toLowerCase() || "dataset",
    columns,
    rows,
  };

  const rawFields = Array.isArray(c.answer_fields) ? c.answer_fields : [];
  if (rawFields.length < 3 || rawFields.length > 6) throw new Error("Generated answer fields were invalid.");

  const fields: AnswerField[] = [];
  const kinds = new Set<string>();
  let positiveCount = 0;

  for (const raw of rawFields) {
    const key = String(raw?.key ?? "").trim();
    const label = String(raw?.label ?? "").trim();
    const kind = String(raw?.metric?.kind ?? "").trim();
    if (!key || !label || !METRIC_KINDS.includes(kind)) throw new Error("Generated answer field was malformed.");
    const metric = {
      kind,
      column: raw?.metric?.column ? String(raw.metric.column) : undefined,
      allowed_values: Array.isArray(raw?.metric?.allowed_values) ? raw.metric.allowed_values.map(String) : undefined,
    } as Metric;

    const computed = computeMetric(dataset, metric);
    const claimed = Number(raw?.expected);
    const tolerance = kind === "sum_valid" ? 1 : 0;
    if (!Number.isFinite(claimed) || Math.abs(claimed - computed) > tolerance) {
      throw new Error(`Answer key for "${key}" did not match the generated dataset.`);
    }
    kinds.add(kind);
    if (kind !== "sum_valid" && kind !== "distinct_count" && computed > 0) positiveCount += 1;

    fields.push({ key, label, type: "number", metric, points: 0, tolerance, answer: computed });
  }

  if (kinds.size < 3) throw new Error("Generated dataset did not contain varied data-quality issues.");
  if (positiveCount < 2) throw new Error("Generated dataset did not contain enough real data-quality issues.");

  const base = Math.floor(10 / fields.length);
  fields.forEach((f, i) => {
    f.points = i === fields.length - 1 ? 10 - base * (fields.length - 1) : base;
  });

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

  const questionText = String(c.question_text ?? "").trim();
  if (!questionText) throw new Error("Generated cleaning question was empty.");

  return {
    title: String(parsed.title ?? "").trim(),
    description: String(parsed.description ?? "").trim(),
    tasks: [
      {
        title: String(c.title ?? "Data cleaning").trim(),
        brief: [String(c.brief_intro ?? "").trim(), "", questionText].join("\n").trim(),
        task_type: "structured",
        rubric_criteria: {
          max_score: 10,
          dataset,
          question_text: questionText,
          fields: fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            answer: f.answer,
            points: f.points,
            tolerance: f.tolerance,
          })),
        },
      },
      {
        title: String(parsed.sql?.title ?? "SQL query").trim(),
        brief: String(parsed.sql.brief).trim(),
        task_type: "text",
        rubric_criteria: {
          max_score: 10,
          prompt_label: String(parsed.sql?.prompt_label ?? "Your SQL query"),
          dataset_schema: dataset.columns,
          criteria: sqlCriteria.slice(0, 6),
        },
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
        rubric_criteria: {
          max_score: 10,
          prompt_label: String(parsed.summary?.prompt_label ?? "Your summary"),
          criteria: summaryCriteria.slice(0, 6),
        },
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
