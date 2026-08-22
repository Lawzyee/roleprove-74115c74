import { supabase } from "@/integrations/supabase/client";

export const FREE_ATTEMPT_LIMIT = 3;

export type DatasetColumn = { key: string; label: string };
export type Dataset = { name: string; columns: DatasetColumn[]; rows: Array<Record<string, string>> };
export type SummaryTable = { title: string; columns: DatasetColumn[]; rows: Array<Record<string, string>> };
export type WrittenQuestion = {
  key: string;
  label: string;
  prompt: string;
  criteria?: string[];
  points: number;
  input?: "sql" | "prose";
};

export type Rubric = {
  max_score?: number;
  stage_kind?: string;
  fields?: Array<{ key: string; label: string; type?: string; answer: number; tolerance?: number; points: number }>;
  dataset?: Dataset;
  datasets?: Dataset[];
  tables?: SummaryTable[];
  written?: WrittenQuestion[];
  deliverable?: { label: string; hint: string; accept: string[] };
  question_text?: string;
  prompt_label?: string;
  options?: string[];
  answer?: number;
  points?: number;
  criteria?: string[];
};

export const STAGE_LABELS: Record<string, string> = {
  business_understanding: "Stage 1 — Business understanding",
  data_acquisition: "Stage 2 — Data acquisition",
  data_quality: "Stage 3 — Data cleaning & preparation",
  analysis_visualisation: "Stage 4 — Analysis & visualisation",
  insights_recommendations: "Stage 5 — Insights & recommendations",
  executive_review: "Stage 6 — Executive review",
  statistical_analysis: "Bonus — Statistical analysis",
  ab_testing: "Bonus — A/B testing",
  forecasting: "Bonus — Forecasting",
  dashboard_build: "Bonus — Dashboard design",
  automation: "Bonus — Automation",
  data_modelling: "Bonus — Data modelling",
  // legacy stage kinds from earlier generations
  sql_reasoning: "SQL & analytical reasoning",
  commercial_interpretation: "Commercial interpretation",
  segmentation: "Segmentation & trade-offs",
  discrepancy: "Discrepancy investigation",
  final_recommendation: "Final recommendation",
};



export function datasetToCsv(dataset: Dataset) {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    dataset.columns.map((c) => esc(c.key)).join(","),
    ...dataset.rows.map((r) => dataset.columns.map((c) => esc(r[c.key])).join(",")),
  ].join("\n");
}

export function downloadDatasetCsv(dataset: Dataset) {
  const blob = new Blob([datasetToCsv(dataset)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${dataset.name || "dataset"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function startAttempt(userId: string, simulationId: string) {
  const { data: existing } = await supabase
    .from("simulation_attempts")
    .select("id")
    .eq("user_id", userId)
    .eq("simulation_id", simulationId)
    .eq("status", "in_progress")
    .maybeSingle();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("simulation_attempts")
    .insert({ user_id: userId, simulation_id: simulationId })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export function compositeScore(attempts: Array<{ overall_score: number | null; status: string }>) {
  const done = attempts.filter((a) => a.status === "completed" && typeof a.overall_score === "number");
  if (!done.length) return null;
  return Math.round(done.reduce((sum, a) => sum + (a.overall_score ?? 0), 0) / done.length);
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
