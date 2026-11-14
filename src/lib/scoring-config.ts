/**
 * Rubric-first weighted scoring configuration.
 *
 * Every grading criterion is mapped to one of four competency pillars and given
 * a tier ("Must Have" / "Good to Have") with a numeric weight. This lives in
 * config so weighting can be tuned without touching the generation engine.
 */

export type Pillar = "framing" | "decision_making" | "communication" | "ownership";

export const PILLARS: Pillar[] = ["framing", "decision_making", "communication", "ownership"];

export const PILLAR_LABELS: Record<Pillar, string> = {
  framing: "Problem Framing & Structuring",
  decision_making: "Data-Driven Decision Making",
  communication: "Communication & Execution Readiness",
  ownership: "Ownership Mindset",
};

export type Tier = "must_have" | "good_to_have";

export const TIER_WEIGHT: Record<Tier, number> = {
  must_have: 3,
  good_to_have: 1,
};

export const TIER_LABELS: Record<Tier, string> = {
  must_have: "Must have",
  good_to_have: "Good to have",
};

type StageConfig = { pillar: Pillar; tier: Tier };

/** Per-stage defaults for the Data Analyst role (and any role reusing these stage kinds). */
export const STAGE_SCORING: Record<string, StageConfig> = {
  business_understanding: { pillar: "framing", tier: "must_have" },
  data_acquisition: { pillar: "decision_making", tier: "good_to_have" },
  data_quality: { pillar: "decision_making", tier: "must_have" },
  analysis_visualisation: { pillar: "decision_making", tier: "must_have" },
  insights_recommendations: { pillar: "ownership", tier: "must_have" },
  executive_review: { pillar: "communication", tier: "must_have" },
  // bonus stages
  statistical_analysis: { pillar: "decision_making", tier: "good_to_have" },
  ab_testing: { pillar: "decision_making", tier: "good_to_have" },
  forecasting: { pillar: "decision_making", tier: "good_to_have" },
  dashboard_build: { pillar: "communication", tier: "good_to_have" },
  automation: { pillar: "ownership", tier: "good_to_have" },
  data_modelling: { pillar: "decision_making", tier: "good_to_have" },
  discrepancy: { pillar: "ownership", tier: "good_to_have" },
  // Customer Support Representative stages
  support_situation: { pillar: "framing", tier: "must_have" },
  support_data_review: { pillar: "decision_making", tier: "good_to_have" },
  support_triage: { pillar: "decision_making", tier: "must_have" },
  support_analysis: { pillar: "decision_making", tier: "must_have" },
  support_responses: { pillar: "communication", tier: "must_have" },
  support_manager_review: { pillar: "ownership", tier: "must_have" },
  escalation_handling: { pillar: "ownership", tier: "good_to_have" },
  live_chat_multitasking: { pillar: "communication", tier: "good_to_have" },
  technical_troubleshooting: { pillar: "framing", tier: "good_to_have" },
  billing_disputes: { pillar: "communication", tier: "good_to_have" },
  multilingual_support: { pillar: "communication", tier: "good_to_have" },
  customer_success: { pillar: "ownership", tier: "good_to_have" },
  // legacy stage kinds
  sql_reasoning: { pillar: "decision_making", tier: "must_have" },
  commercial_interpretation: { pillar: "decision_making", tier: "must_have" },
  segmentation: { pillar: "decision_making", tier: "good_to_have" },
  final_recommendation: { pillar: "communication", tier: "must_have" },
};

const DEFAULT_STAGE: StageConfig = { pillar: "decision_making", tier: "good_to_have" };

export function stageScoring(stageKind: string | undefined | null): StageConfig {
  return (stageKind && STAGE_SCORING[stageKind]) || DEFAULT_STAGE;
}

export type CriterionResult = {
  label: string;
  pillar: Pillar;
  tier: Tier;
  weight: number;
  score: number;
  max: number;
  cannot_evaluate: boolean;
  justification: string;
};

/**
 * Weighted roll-up:
 *   Σ(score × weight) / Σ(max × weight), over evaluated criteria only.
 * Criteria marked "Cannot evaluate" are excluded from numerator and denominator.
 */
export function rollUp(criteria: CriterionResult[]) {
  const evaluated = criteria.filter((c) => !c.cannot_evaluate);
  let num = 0;
  let den = 0;
  for (const c of evaluated) {
    num += c.score * c.weight;
    den += c.max * c.weight;
  }
  const overall = den > 0 ? Math.round((num / den) * 100) : 0;

  const pillarScores: Partial<Record<Pillar, number | null>> = {};
  for (const pillar of PILLARS) {
    const subset = evaluated.filter((c) => c.pillar === pillar);
    let n = 0;
    let d = 0;
    for (const c of subset) {
      n += c.score * c.weight;
      d += c.max * c.weight;
    }
    pillarScores[pillar] = d > 0 ? Math.round((n / d) * 100) : null;
  }

  return { overall, pillarScores, evaluatedCount: evaluated.length, skippedCount: criteria.length - evaluated.length };
}

/* ---------------- Uploaded deliverables ---------------- */

export type DeliverableCategory = "slides" | "document" | "image" | "spreadsheet";

/**
 * Judgement criteria for uploaded work, graded by AI with cited evidence.
 * They are added on top of the stage's existing criteria (whose weights are
 * unchanged). No upload = no deliverable criteria, so skipping is never penalised.
 */
export const DELIVERABLE_RUBRICS: Record<DeliverableCategory, { pillar: Pillar; tier: Tier; criteria: string[] }> = {
  slides: {
    pillar: "communication",
    tier: "good_to_have",
    criteria: [
      "A clear headline message the audience can repeat",
      "One idea per slide",
      "Charts are readable and labelled",
      "A recommendation with a concrete next step",
      "Suitable for non-technical stakeholders",
    ],
  },
  document: {
    pillar: "communication",
    tier: "good_to_have",
    criteria: [
      "A clear headline message up front",
      "Logical structure that is easy to follow",
      "Uses specific numbers from the case as evidence",
      "A recommendation with a concrete next step",
      "Suitable for non-technical stakeholders",
    ],
  },
  image: {
    pillar: "communication",
    tier: "good_to_have",
    criteria: [
      "The right chart type for the question",
      "A clear title",
      "Axis labels and units",
      "No misleading scales (e.g. truncated axes)",
      "Readable: legible text, sensible colours, not cluttered",
    ],
  },
  spreadsheet: {
    pillar: "decision_making",
    tier: "good_to_have",
    criteria: [
      "Tidy, consistent structure (one header row, one record per row, consistent formats)",
      "Changes are documented (a notes sheet, a flag column or similar)",
      "Formulas are used where a calculation is expected, not hard-coded numbers",
    ],
  },
};

/** Measured cleaning checks for the Data Analyst cleaning upload. */
export const CLEANING_CHECK_SCORING: { pillar: Pillar; tier: Tier } = { pillar: "decision_making", tier: "must_have" };

/** Points available per deliverable criterion. */
export const DELIVERABLE_CRITERION_MAX = 2;

export function deliverableCategory(kind: string): DeliverableCategory | null {
  if (kind === "pptx") return "slides";
  if (kind === "pdf" || kind === "docx") return "document";
  if (kind === "png" || kind === "jpg") return "image";
  if (kind === "csv" || kind === "xlsx") return "spreadsheet";
  return null;
}
