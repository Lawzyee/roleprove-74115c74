import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildMonthlyTrendTable, buildSegmentTable, summariseTable } from "./jd-aggregates";


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

const OPTIONAL_STAGES = ["commercial_interpretation", "segmentation", "discrepancy"] as const;

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

function normaliseTable(raw: any): SummaryTable | null {
  const columns: DatasetColumn[] = (Array.isArray(raw?.columns) ? raw.columns : [])
    .map((col: any) => ({ key: String(col?.key ?? "").trim(), label: String(col?.label ?? col?.key ?? "").trim() }))
    .filter((col: DatasetColumn) => !!col.key);
  if (columns.length < 2) return null;
  const rows: DatasetRow[] = (Array.isArray(raw?.rows) ? raw.rows : []).map((r: any) => {
    const row: DatasetRow = {};
    for (const col of columns) row[col.key] = String(r?.[col.key] ?? "");
    return row;
  });
  if (rows.length < 2) return null;
  return { title: String(raw?.title ?? "Summary").trim(), columns, rows };
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
      "Design the FOUNDATION of a commercial case study for this specific business.",
      "",
      "1. Choose which optional later stages this job description actually justifies. Available optional stages: commercial_interpretation (open reasoning on a monthly trend table), segmentation (which segment to prioritise, value-at-risk reasoning), discrepancy (finance figure vs dashboard figure investigation). Pick 1 to 3 of them — only ones the posting genuinely supports. Stages data_quality, sql_reasoning and final_recommendation are always included and must not be listed.",
      "2. Design TWO linked datasets that reference each other by an id column (for example an entity table and a transactions table). The child table must contain at least one orphaned reference. Column names, grain and data-quality issues must come from the systems and problems this posting describes — never a generic id/customer/plan/amount/date template.",
      "3. Design 3-5 rule-graded numeric answer fields plus ONE short written triage question ('which issue would you investigate first, and why?').",
      "",
      "Reply as JSON exactly in this shape:",
      JSON.stringify({
        title: "<short simulation title referencing the role/company>",
        description: "<1-2 sentence description>",
        optional_stages: ["commercial_interpretation"],
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

  // Stage 3/4 tables are computed in code from the real rows. A stage is only
  // offered when its table can genuinely be derived from the dataset.
  const monthlyTable = buildMonthlyTrendTable(datasets);
  const segmentTable = buildSegmentTable(datasets);
  const supports: Record<string, boolean> = {
    commercial_interpretation: !!monthlyTable,
    segmentation: !!segmentTable,
    discrepancy: true,
  };

  let optional = (Array.isArray(parsed.optional_stages) ? parsed.optional_stages : [])
    .map(String)
    .filter((s: string) => (OPTIONAL_STAGES as readonly string[]).includes(s) && supports[s])
    .slice(0, 3);
  if (!optional.length) {
    optional = monthlyTable ? ["commercial_interpretation"] : segmentTable ? ["segmentation"] : ["discrepancy"];
  }


  const stage: GeneratedStage = {
    title: String(dq.title ?? "Data quality and validation").trim(),
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
    optional,
    computedTables: { commercial_interpretation: monthlyTable, segmentation: segmentTable },
    stage,
    fields,
  };
}

/** Stages 2-6: SQL reasoning plus the selected open written stages, consistent with the datasets. */
async function generateNarrativeStages(
  extracted: Extracted,
  datasets: Dataset[],
  optional: string[],
  computedTables: Record<string, SummaryTable | null>,
): Promise<GeneratedStage[]> {

  const themes = extracted.emphasis_themes.length ? extracted.emphasis_themes : extracted.skills.slice(0, 5);

  const parsed = await callAi(
    "You design multi-stage Data Analyst case-study assessments. Reply with JSON only.",
    [
      `JOB POSTING CONTEXT:\nRole: ${extracted.role_type}\nSeniority: ${extracted.seniority}\nCompany: ${extracted.company_context}\nEmphasis themes: ${themes.join("; ")}`,
      "",
      `THE CANDIDATE ALREADY HAS THESE TABLES (use their real names and columns everywhere):\n${datasetSchemaSummary(datasets)}`,
      "",
      `Generate these stages: sql_reasoning, ${optional.join(", ")}, final_recommendation. Every number you invent must be plausible against the tables above and consistent between stages.`,
      "",
      "Reply as JSON exactly in this shape (omit the optional stages that were not requested):",
      JSON.stringify({
        sql_reasoning: {
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
        },
        commercial_interpretation: {
          title: "<stage title>",
          brief: "<framing sentence>",
          table: { title: "<table title>", columns: [{ key: "month", label: "Month" }], rows: [{ month: "2026-01" }] },
          question: { key: "concerns", label: "<label>", prompt: "<what concerns you about this data and why>", criteria: ["…", "…", "…", "…"] },
        },
        segmentation: {
          title: "<stage title>",
          brief: "<framing sentence>",
          table: { title: "<segment breakdown title>", columns: [{ key: "segment", label: "Segment" }], rows: [{ segment: "…" }] },
          question: { key: "priority_segment", label: "<label>", prompt: "<which segment would you prioritise and why>", criteria: ["…", "…", "…", "…"] },
        },
        discrepancy: {
          title: "<stage title>",
          brief: "<short scenario where finance's figure disagrees with the dashboard figure, with both numbers>",
          question: { key: "investigation", label: "<label>", prompt: "<what do you do next>", criteria: ["…", "…", "…", "…"] },
        },
        final_recommendation: {
          title: "<stage title>",
          brief: "<closing framing referencing the case>",
          question: {
            key: "recommendation",
            label: "<label>",
            prompt: "<what should the business do next, and how would you measure it>",
            criteria: ["…", "…", "…", "…", "…"],
          },
        },
      }),
      "",
      "sql_reasoning must contain 2-3 sub_questions, each answered as free-text SQL, and its criteria must describe correct approach/logic (joins, filters, denominator choice) so that reasonable equivalent queries score well — never exact string matching.",
      "commercial_interpretation and segmentation tables need 4-8 rows and 3-5 columns of real numbers.",
      "Every criteria array must contain 4-5 concrete statements that separate a weak answer from a strong one.",
      "final_recommendation criteria must explicitly reward a Finding -> Evidence -> Impact -> Recommendation -> Measurement structure.",
    ].join("\n"),
  );

  const stages: GeneratedStage[] = [];

  const sql = parsed.sql_reasoning ?? {};
  const subs = Array.isArray(sql.sub_questions) ? sql.sub_questions.slice(0, 3) : [];
  if (subs.length < 2 || !String(sql.brief ?? "").trim()) throw new Error("Generated SQL stage was incomplete.");
  const sqlPoints = distributePoints(subs.length);
  stages.push({
    title: String(sql.title ?? "SQL and analytical reasoning").trim(),
    brief: String(sql.brief).trim(),
    task_type: "case",
    rubric_criteria: {
      max_score: 10,
      stage_kind: "sql_reasoning",
      datasets,
      written: subs.map((s: any, i: number) => normaliseWritten(s, sqlPoints[i]!, "sql")),
    },
  });

  for (const kind of optional) {
    const raw = parsed[kind];
    if (!raw) continue;
    const question = normaliseWritten(raw.question, 10, "prose");
    const table = raw.table ? normaliseTable(raw.table) : null;
    if ((kind === "commercial_interpretation" || kind === "segmentation") && !table) continue;
    stages.push({
      title: String(raw.title ?? kind.replace(/_/g, " ")).trim(),
      brief: String(raw.brief ?? "").trim(),
      task_type: "case",
      rubric_criteria: {
        max_score: 10,
        stage_kind: kind,
        tables: table ? [table] : undefined,
        written: [question],
      },
    });
  }

  const final = parsed.final_recommendation ?? {};
  const finalQuestion = normaliseWritten(final.question, 10, "prose");
  stages.push({
    title: String(final.title ?? "Final recommendation").trim(),
    brief: String(final.brief ?? "").trim(),
    task_type: "case",
    rubric_criteria: {
      max_score: 10,
      stage_kind: "final_recommendation",
      written: [finalQuestion],
      deliverable: {
        label: "Upload your findings deck, summary or dashboard export (optional)",
        hint: "PDF, PPTX, PNG or JPG. Stored as a work sample; decks and PDFs get written feedback, images are marked pending review.",
        accept: [".pdf", ".pptx", ".png", ".jpg", ".jpeg"],
      },
    },
  });

  return stages;
}

async function generateCaseStudy(extracted: Extracted): Promise<GeneratedSimulation> {
  const foundation = await generateFoundation(extracted);
  const narrative = await generateNarrativeStages(extracted, foundation.datasets, foundation.optional);
  return {
    title: foundation.title,
    description: foundation.description,
    tasks: [foundation.stage, ...narrative],
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
