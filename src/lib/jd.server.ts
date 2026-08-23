import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildMonthlyTrendTable, buildSegmentTable, summariseTable } from "./jd-aggregates";
import { pickGenericScenario } from "./generic-scenarios";


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
  | { kind: "duplicate_rows"; dataset?: string }
  | { kind: "invalid_number"; column: string; dataset?: string }
  | { kind: "bad_date_format"; column: string; dataset?: string }
  | { kind: "missing_values"; column: string; dataset?: string }
  | { kind: "inconsistent_labels"; column: string; allowed_values: string[]; dataset?: string }
  | { kind: "sum_valid"; column: string; dataset?: string }
  | { kind: "distinct_count"; column: string; dataset?: string }
  | { kind: "orphan_rows"; column: string; dataset?: string; parent_dataset: string; parent_column: string };

type AnswerField = {
  key: string;
  label: string;
  type: "number";
  metric: Metric;
  points: number;
  tolerance?: number;
  answer: number;
};

type WrittenQuestion = {
  key: string;
  label: string;
  prompt: string;
  criteria: string[];
  points: number;
  input?: "sql" | "prose";
};

type SummaryTable = { title: string; columns: DatasetColumn[]; rows: DatasetRow[] };

type Deliverable = { label: string; hint: string; accept: string[] };

export type StageRubric = {
  max_score: number;
  stage_kind: string;
  datasets?: Dataset[];
  tables?: SummaryTable[];
  question_text?: string;
  fields?: Array<{ key: string; label: string; type: "number"; answer: number; points: number; tolerance?: number }>;
  written?: WrittenQuestion[];
  deliverable?: Deliverable;
};

type GeneratedStage = { title: string; brief: string; task_type: "case"; rubric_criteria: StageRubric };

type GeneratedSimulation = { title: string; description: string; tasks: GeneratedStage[] };

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

/** Recomputes a single metric server-side, directly from the generated dataset(s). */
export function computeMetric(datasets: Dataset[], metric: Metric): number {
  const dataset = metric.dataset ? datasets.find((d) => d.name === metric.dataset) : datasets[0];
  if (!dataset) throw new Error(`Metric references unknown dataset "${metric.dataset}".`);

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
    case "orphan_rows": {
      const parent = datasets.find((d) => d.name === metric.parent_dataset);
      if (!parent) throw new Error(`orphan_rows references unknown parent dataset "${metric.parent_dataset}".`);
      if (!parent.columns.some((c) => c.key === metric.parent_column)) {
        throw new Error(`orphan_rows references unknown parent column "${metric.parent_column}".`);
      }
      const keys = new Set(
        uniqueRows(parent)
          .map((r) => String(r[metric.parent_column] ?? "").trim().toLowerCase())
          .filter((v) => v && !isBlank(v)),
      );
      return unique.filter((r) => {
        const v = String(r[col!] ?? "").trim().toLowerCase();
        return !!v && !isBlank(v) && !keys.has(v);
      }).length;
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
  "orphan_rows",
];

/**
 * Bonus stages are only added on top of the fixed pipeline when the job
 * description explicitly emphasises that skill.
 */
const BONUS_STAGES: Array<{ kind: string; label: string; test: RegExp }> = [
  { kind: "ab_testing", label: "A/B testing", test: /\ba\/?b test|experiment(ation)?|split test/i },
  { kind: "forecasting", label: "Forecasting", test: /forecast|time series|demand planning|projection/i },
  {
    kind: "statistical_analysis",
    label: "Statistical analysis",
    test: /statistic|significance|regression|hypothesis|confidence interval/i,
  },
  { kind: "dashboard_build", label: "Dashboard design", test: /dashboard|power bi|tableau|looker|data studio/i },
  { kind: "automation", label: "Automation", test: /automat|pipeline scheduling|etl|airflow|dbt/i },
  { kind: "data_modelling", label: "Data modelling", test: /data model|dimensional|star schema|warehouse design/i },
];

function detectBonusStages(extracted: Extracted) {
  const haystack = [
    extracted.role_type,
    extracted.company_context,
    ...extracted.skills,
    ...extracted.responsibilities,
    ...extracted.emphasis_themes,
  ]
    .join(" ")
    .toLowerCase();
  return BONUS_STAGES.filter((b) => b.test.test(haystack)).slice(0, 2);
}


function normaliseDataset(raw: any): Dataset {
  const columns: DatasetColumn[] = (Array.isArray(raw?.columns) ? raw.columns : [])
    .map((col: any) => ({ key: String(col?.key ?? "").trim(), label: String(col?.label ?? col?.key ?? "").trim() }))
    .filter((col: DatasetColumn) => !!col.key);
  const rows: DatasetRow[] = (Array.isArray(raw?.rows) ? raw.rows : []).map((r: any) => {
    const row: DatasetRow = {};
    for (const col of columns) row[col.key] = r?.[col.key] === undefined || r?.[col.key] === null ? "" : String(r[col.key]);
    return row;
  });
  return {
    name: String(raw?.name ?? "dataset").trim().replace(/[^a-z0-9_\-]/gi, "_").toLowerCase() || "dataset",
    columns,
    rows,
  };
}




function normaliseWritten(raw: any, points: number, input: "sql" | "prose"): WrittenQuestion {
  const key = String(raw?.key ?? "").trim();
  const prompt = String(raw?.prompt ?? "").trim();
  const criteria = (Array.isArray(raw?.criteria) ? raw.criteria : []).map(String).filter(Boolean).slice(0, 6);
  if (!key || !prompt || criteria.length < 3) throw new Error("A written question was generated incompletely.");
  return { key, label: String(raw?.label ?? "Your answer").trim(), prompt, criteria, points, input };
}

function distributePoints(count: number, total = 10) {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? total - base * (count - 1) : base));
}

function datasetSchemaSummary(datasets: Dataset[]) {
  return datasets
    .map(
      (d) =>
        `${d.name}(${d.columns.map((c) => c.key).join(", ")}) — ${d.rows.length} rows. Sample: ${JSON.stringify(d.rows.slice(0, 3))}`,
    )
    .join("\n");
}

/** Stage 1 + dataset foundation: linked datasets, rule-graded fields and one written triage question. */
async function generateFoundation(extracted: Extracted) {
  const themes = extracted.emphasis_themes.length ? extracted.emphasis_themes : extracted.skills.slice(0, 5);

  const parsed = await callAi(
    "You design multi-stage, hands-on Data Analyst case-study assessments. Every generation must be original: freshly designed tables, new entity names, new values and dates. Reply with JSON only.",
    [
      `JOB POSTING CONTEXT:\nRole: ${extracted.role_type}\nSeniority: ${extracted.seniority}\nCompany context: ${extracted.company_context}\nSkills/tools: ${extracted.skills.join(", ")}\nResponsibilities: ${extracted.responsibilities.join("; ")}\nEMPHASIS THEMES (must visibly shape the data itself, not just the wording): ${themes.join("; ")}`,
      "",
      `Randomisation seed (make the data unique to this seed): ${Math.random().toString(36).slice(2)}-${Date.now()}`,
      "",
      "Design the FOUNDATION of a commercial case study for this specific business: the datasets and the data cleaning stage.",
      "",
      "1. Design TWO linked datasets that reference each other by an id column (for example an entity table and a transactions table). The child table must contain at least one orphaned reference. Column names, grain and data-quality issues must come from the systems and problems this posting describes — never a generic id/customer/plan/amount/date template.",
      "2. At least one table must include a date column (YYYY-MM-DD, spanning 3+ months, some rows deliberately mis-formatted), one money/quantity column, and one low-cardinality categorical column (tier, channel, region, status or similar) — later stages summarise these.",
      "3. Design 3-5 rule-graded numeric answer fields plus ONE short written triage question ('which issue would you investigate first, and why?').",
      "",
      "Reply as JSON exactly in this shape:",
      JSON.stringify({
        title: "<short simulation title referencing the role/company>",
        description: "<1-2 sentence description>",

        datasets: [
          { name: "<snake_case parent table>", columns: [{ key: "<snake_case>", label: "<label>" }], rows: [{ "<key>": "<value>" }] },
          { name: "<snake_case child table>", columns: [{ key: "<snake_case>", label: "<label>" }], rows: [{ "<key>": "<value>" }] },
        ],
        data_quality: {
          title: "<stage title>",
          brief_intro: "<scenario framing, 3-5 sentences, no tables>",
          question_text: "<the numeric questions, referencing your real table and column names>",
          answer_fields: [
            {
              key: "<snake_case>",
              label: "<what the candidate must enter>",
              metric: {
                kind: `<one of ${METRIC_KINDS.join(" | ")}>`,
                dataset: "<which table>",
                column: "<column key, omit for duplicate_rows>",
                allowed_values: ["<only for inconsistent_labels>"],
                parent_dataset: "<only for orphan_rows>",
                parent_column: "<only for orphan_rows>",
              },
              expected: 0,
            },
          ],
          written: {
            key: "triage",
            label: "<label for the text box>",
            prompt: "<which of these issues would you investigate first and why>",
            criteria: ["…", "…", "…", "…"],
          },
        },
      }),
      "",
      "Dataset rules: parent table 8-12 rows, child table 12-16 rows, 4-7 columns each. Introduce 3+ different categories of realistic data-quality problem across the tables.",
      "Metric semantics (computed after removing exact duplicate rows within a table): duplicate_rows = extra exact-duplicate rows; invalid_number = negative or non-numeric values; bad_date_format = dates not in YYYY-MM-DD; missing_values = blank values; inconsistent_labels = values outside allowed_values; sum_valid = sum of valid non-negative values; distinct_count = distinct non-blank values; orphan_rows = child rows whose column value does not exist in parent_dataset.parent_column.",
      "'expected' must be the exact value computed from the rows you generated. Use at least 3 different metric kinds, include one orphan_rows field, and at least two counting metrics whose expected value is greater than zero.",
    ].join("\n"),
  );

  const rawDatasets = (Array.isArray(parsed.datasets) ? parsed.datasets : []).map(normaliseDataset);
  const datasets = rawDatasets.filter((d: Dataset) => d.columns.length >= 3 && d.rows.length >= 6);
  if (datasets.length < 2) throw new Error("Generated datasets were incomplete.");

  const dq = parsed.data_quality ?? {};
  const rawFields = Array.isArray(dq.answer_fields) ? dq.answer_fields : [];
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
      dataset: raw?.metric?.dataset ? String(raw.metric.dataset) : undefined,
      column: raw?.metric?.column ? String(raw.metric.column) : undefined,
      allowed_values: Array.isArray(raw?.metric?.allowed_values) ? raw.metric.allowed_values.map(String) : undefined,
      parent_dataset: raw?.metric?.parent_dataset ? String(raw.metric.parent_dataset) : undefined,
      parent_column: raw?.metric?.parent_column ? String(raw.metric.parent_column) : undefined,
    } as Metric;

    // The answer key is always recomputed from the generated rows — the model's
    // claimed value is only a sanity signal, never what the candidate is graded on.
    let computed: number;
    try {
      computed = computeMetric(datasets, metric);
    } catch {
      continue;
    }
    if (!Number.isFinite(computed)) continue;
    const tolerance = kind === "sum_valid" ? 1 : 0;
    kinds.add(kind);
    if (kind !== "sum_valid" && kind !== "distinct_count" && computed > 0) positiveCount += 1;

    fields.push({ key, label, type: "number", metric, points: 0, tolerance, answer: computed });

  }

  if (fields.length < 3) throw new Error("Generated answer fields were invalid.");
  if (kinds.size < 3) throw new Error("Generated datasets did not contain varied data-quality issues.");
  if (positiveCount < 2) throw new Error("Generated datasets did not contain enough real data-quality issues.");


  // 6 points across the rule-graded fields, 4 for the written triage question.
  const fieldPoints = distributePoints(fields.length, 6);
  fields.forEach((f, i) => {
    f.points = fieldPoints[i]!;
  });

  const written = normaliseWritten(dq.written, 4, "prose");
  const questionText = String(dq.question_text ?? "").trim();
  const briefIntro = String(dq.brief_intro ?? "").trim();
  if (!questionText || !briefIntro) throw new Error("Generated data-quality stage was incomplete.");

  // Stage 5's summary table is computed in code from the real rows.
  const monthlyTable = buildMonthlyTrendTable(datasets);
  const segmentTable = buildSegmentTable(datasets);
  const insightsTable = monthlyTable ?? segmentTable;

  const stage: GeneratedStage = {
    title: String(dq.title ?? "Data cleaning and preparation").trim(),
    brief: [briefIntro, "", questionText].join("\n").trim(),
    task_type: "case",
    rubric_criteria: {
      max_score: 10,
      stage_kind: "data_quality",
      datasets,
      question_text: questionText,
      fields: fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        answer: f.answer,
        points: f.points,
        tolerance: f.tolerance,
      })),
      written: [written],
      deliverable: {
        label: "Upload your cleaned dataset (optional)",
        hint: "CSV or XLSX. Stored as a work sample — it does not change your score.",
        accept: [".csv", ".xlsx"],
      },
    },
  };

  return {
    title: String(parsed.title ?? "").trim(),
    description: String(parsed.description ?? "").trim(),
    datasets,
    insightsTable,
    stage,
    fields,
  };
}


/**
 * The canonical Data Analyst pipeline is fixed in code: stages 1, 2, 4, 5 and 6
 * around the code-owned cleaning stage. The AI only fills content.
 */
async function generatePipelineStages(
  extracted: Extracted,
  datasets: Dataset[],
  insightsTable: SummaryTable | null,
  bonus: Array<{ kind: string; label: string }>,
): Promise<{ before: GeneratedStage[]; after: GeneratedStage[] }> {
  const themes = extracted.emphasis_themes.length ? extracted.emphasis_themes : extracted.skills.slice(0, 5);

  const parsed = await callAi(
    "You write content for a fixed six-stage Data Analyst case-study assessment. The stage list is decided for you — never add, drop or reorder stages. Reply with JSON only.",
    [
      `JOB POSTING CONTEXT:\nRole: ${extracted.role_type}\nSeniority: ${extracted.seniority}\nCompany: ${extracted.company_context}\nEmphasis themes: ${themes.join("; ")}`,
      "",
      `THE CANDIDATE'S DATASETS (use their real names and columns everywhere):\n${datasetSchemaSummary(datasets)}`,
      "",
      insightsTable
        ? `ALREADY-COMPUTED SUMMARY TABLE FOR STAGE 5 (derived in code from the real rows above — treat these numbers as fact, write your brief and question around them, and DO NOT restate, alter, round or invent alternative figures):\n${summariseTable(insightsTable)}`
        : "No summary table could be derived, so stage 5 must reference the candidate's own cleaned dataset rather than any specific figures.",
      "",
      "Write the content for these stages of the fixed pipeline: business_understanding (stage 1), data_acquisition (stage 2), analysis_visualisation (stage 4), insights_recommendations (stage 5), executive_review (stage 6).",
      bonus.length
        ? `Also write these bonus stages, because the posting explicitly emphasises them: ${bonus
            .map((b) => `${b.kind} (${b.label})`)
            .join(", ")}.`
        : "No bonus stages are required.",
      "",
      "Reply as JSON exactly in this shape:",
      JSON.stringify({
        business_understanding: {
          title: "<stage title>",
          brief: "<a vague stakeholder request from a named leader at this company, 3-5 sentences, no data shown yet>",
          question: {
            key: "framing",
            label: "<label>",
            prompt: "<translate this into 2-3 specific analytical questions, define success/KPIs, and list the data you would need>",
            criteria: ["…", "…", "…", "…"],
          },
        },
        data_acquisition: {
          title: "<stage title>",
          brief: "<describe the available data sources in one line each — you MUST use the real table names listed above, and may add at most one extra external source; the candidate sees a preview of every real table below the brief>",
          question: {
            key: "sources",
            label: "<label>",
            prompt: "<which sources would you pull and why, and what would you check before trusting them>",
            criteria: ["…", "…", "…", "…"],
          },
          extraction_query: {
            key: "extraction_sql",
            label: "<label for the SQL box>",
            prompt: "<write the extraction query/approach for the most relevant source, using the real table and column names>",
            criteria: ["…", "…", "…", "…"],
          },
        },
        analysis_visualisation: {
          title: "<stage title>",
          brief: "<scenario + the schema of the tables, 3-6 sentences>",
          sub_questions: [
            {
              key: "<snake_case>",
              label: "<label for the SQL box>",
              prompt: "<business-logic question, e.g. a churn or retention rate where the candidate must decide the correct denominator>",
              criteria: ["…", "…", "…", "…"],
            },
          ],
          visualisation_question: {
            key: "chart_choice",
            label: "<label>",
            prompt: "<which chart type would best communicate the finding from one of the questions above, and why>",
            criteria: ["…", "…", "…", "…"],
          },
        },
        insights_recommendations: {
          title: "<stage title>",
          brief: "<framing sentence introducing the already-computed table; no numbers of your own>",
          question: {
            key: "recommendation",
            label: "<label>",
            prompt: "<what is concerning here, and what should the business do next — answer as Finding, Evidence, Impact, Recommendation, Measurement>",
            criteria: ["…", "…", "…", "…", "…"],
          },
        },
        executive_review: {
          title: "<stage title>",
          brief: "<you have 10 minutes with leadership: framing, 2-4 sentences>",
          question: {
            key: "executive_summary",
            label: "<label>",
            prompt: "<write the short executive summary you would open with — a few sentences, not a full report>",
            criteria: ["…", "…", "…", "…"],
          },
        },
        bonus_stages: [
          {
            kind: "<one of the requested bonus kinds>",
            title: "<stage title>",
            brief: "<scenario grounded in this company and the datasets>",
            question: { key: "<snake_case>", label: "<label>", prompt: "<question>", criteria: ["…", "…", "…", "…"] },
          },
        ],
      }),
      "",
      "analysis_visualisation must contain 2-3 sub_questions answered as free-text SQL, and its criteria must describe correct approach/logic (joins, filters, denominator choice) so reasonable equivalent queries score well — never exact string matching. The visualisation question is graded on reasoning about chart choice, not on producing a chart.",
      "Do not output any 'table' field: the computed table supplied above is inserted verbatim.",
      "Every criteria array must contain 4-5 concrete statements that separate a weak answer from a strong one.",
      "insights_recommendations criteria must explicitly reward a Finding -> Evidence -> Impact -> Recommendation -> Measurement structure.",
      bonus.length ? "" : "Return bonus_stages as an empty array.",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  function simpleStage(raw: any, kind: string, fallbackTitle: string, extra: Partial<StageRubric> = {}): GeneratedStage {
    const question = normaliseWritten(raw?.question, 10, "prose");
    return {
      title: String(raw?.title ?? fallbackTitle).trim() || fallbackTitle,
      brief: String(raw?.brief ?? "").trim(),
      task_type: "case",
      rubric_criteria: { max_score: 10, stage_kind: kind, written: [question], ...extra },
    };
  }

  // Stage 1
  const stage1 = simpleStage(parsed.business_understanding, "business_understanding", "Business understanding");

  // Stage 2 — written justification plus an extraction query.
  const acq = parsed.data_acquisition ?? {};
  const acqWritten = [normaliseWritten(acq.question, 5, "prose"), normaliseWritten(acq.extraction_query, 5, "sql")];
  // Show a real preview of every table the stage-2 questions can reference, so the
  // candidate always sees the actual column names before reasoning or writing SQL.
  const previewDatasets: Dataset[] = datasets.map((d) => ({
    name: d.name,
    columns: d.columns,
    rows: d.rows.slice(0, 5),
  }));
  const stage2: GeneratedStage = {
    title: String(acq.title ?? "Data acquisition").trim() || "Data acquisition",
    brief: String(acq.brief ?? "").trim(),
    task_type: "case",
    rubric_criteria: {
      max_score: 10,
      stage_kind: "data_acquisition",
      datasets: previewDatasets,
      written: acqWritten,
    },
  };

  // Stage 4 — SQL sub-questions plus the visualisation judgement question.
  const analysis = parsed.analysis_visualisation ?? {};
  const subs = Array.isArray(analysis.sub_questions) ? analysis.sub_questions.slice(0, 3) : [];
  if (subs.length < 2 || !String(analysis.brief ?? "").trim()) throw new Error("Generated analysis stage was incomplete.");
  const sqlPoints = distributePoints(subs.length, 7);
  const stage4: GeneratedStage = {
    title: String(analysis.title ?? "Analysis and visualisation").trim(),
    brief: String(analysis.brief).trim(),
    task_type: "case",
    rubric_criteria: {
      max_score: 10,
      stage_kind: "analysis_visualisation",
      datasets,
      written: [
        ...subs.map((s: any, i: number) => normaliseWritten(s, sqlPoints[i]!, "sql")),
        normaliseWritten(analysis.visualisation_question, 3, "prose"),
      ],
    },
  };

  // Stage 5 — grounded summary table plus the Finding→Measurement answer.
  const stage5 = simpleStage(
    parsed.insights_recommendations,
    "insights_recommendations",
    "Insights and recommendations",
    insightsTable ? { tables: [insightsTable] } : {},
  );

  // Stage 6 — executive summary plus the optional deliverable.
  const stage6 = simpleStage(parsed.executive_review, "executive_review", "Executive review", {
    deliverable: {
      label: "Upload your findings deck, summary or dashboard export (optional)",
      hint: "PDF, PPTX, PNG or JPG. Stored as a work sample; decks and PDFs get written feedback, images are marked pending review.",
      accept: [".pdf", ".pptx", ".png", ".jpg", ".jpeg"],
    },
  });

  const bonusKinds = new Set(bonus.map((b) => b.kind));
  const bonusStages: GeneratedStage[] = (Array.isArray(parsed.bonus_stages) ? parsed.bonus_stages : [])
    .filter((raw: any) => bonusKinds.has(String(raw?.kind)))
    .slice(0, 2)
    .flatMap((raw: any) => {
      try {
        return [simpleStage(raw, String(raw.kind), String(raw.kind).replace(/_/g, " "))];
      } catch {
        return [];
      }
    });

  return { before: [stage1, stage2], after: [stage4, stage5, stage6, ...bonusStages] };
}

async function generateCaseStudy(extracted: Extracted): Promise<GeneratedSimulation> {
  const foundation = await generateFoundation(extracted);
  const { before, after } = await generatePipelineStages(
    extracted,
    foundation.datasets,
    foundation.insightsTable,
    detectBonusStages(extracted),
  );

  return {
    title: foundation.title,
    description: foundation.description,
    tasks: [...before, foundation.stage, ...after],
  };
}


async function generateCaseStudyWithRetry(extracted: Extracted): Promise<GeneratedSimulation> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await generateCaseStudy(extracted);
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

  const personalised = await generateCaseStudyWithRetry(extracted);

  const { data: newSim, error: simError } = await supabaseAdmin
    .from("simulations")
    .insert({
      role_id: baseSim.role_id,
      title: personalised.title || `${extracted.role_type} — tailored case study`,
      description:
        personalised.description ||
        `A multi-stage Data Analyst case study generated around the job description you pasted for ${extracted.role_type}.`,
      estimated_minutes: Math.max(baseSim.estimated_minutes, personalised.tasks.length * 12),
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

/**
 * Generic (non-JD) Data Analyst simulation.
 * Runs the exact same canonical 6-stage generation pipeline as the JD path,
 * seeded with a randomly picked business scenario instead of parsed JD text.
 * Produces a brand-new is_personalized = false simulation record on every call.
 */
export async function generateGenericSimulation(userId: string) {
  const scenario = pickGenericScenario();

  const extracted: Extracted = {
    role_type: "Data Analyst",
    seniority: "junior",
    skills: scenario.skills,
    responsibilities: scenario.responsibilities,
    emphasis_themes: scenario.emphasis_themes,
    company_context: scenario.company_context,
    confidence: 1,
  };

  const { data: role, error: roleError } = await supabaseAdmin
    .from("roles")
    .select("id")
    .ilike("name", "%data analyst%")
    .limit(1)
    .maybeSingle();
  if (roleError) throw new Error(roleError.message);
  if (!role) throw new Error("The Data Analyst role is unavailable.");

  const generated = await generateCaseStudyWithRetry(extracted);

  const { data: newSim, error: simError } = await supabaseAdmin
    .from("simulations")
    .insert({
      role_id: role.id,
      title: generated.title || "Data Analyst case study",
      description:
        generated.description ||
        "A multi-stage Data Analyst case study generated for this attempt.",
      estimated_minutes: Math.max(30, generated.tasks.length * 12),
      is_personalized: false,
      owner_user_id: userId,
    } as any)
    .select("id")
    .single();
  if (simError) throw new Error(simError.message);

  const { error: tasksError } = await supabaseAdmin.from("simulation_tasks").insert(
    generated.tasks.map((t, i) => ({
      simulation_id: newSim.id,
      title: t.title,
      brief: t.brief,
      task_type: t.task_type,
      rubric_criteria: t.rubric_criteria,
      order: i + 1,
    })) as any,
  );
  if (tasksError) throw new Error(tasksError.message);

  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from("simulation_attempts")
    .insert({
      user_id: userId,
      simulation_id: newSim.id,
      simulation_type: "generic",
    } as any)
    .select("id")
    .single();
  if (attemptError) throw new Error(attemptError.message);

  return { attemptId: attempt.id as string, simulationId: newSim.id as string, scenario: scenario.id };
}
