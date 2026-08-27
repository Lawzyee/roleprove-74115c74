export const PREP_CATEGORIES = [
  "can_do_job",
  "solve_problems",
  "work_with_others",
  "can_trust",
  "will_grow",
] as const;
export type PrepCategory = (typeof PREP_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  can_do_job: "Can they do the job?",
  solve_problems: "Can they solve problems?",
  work_with_others: "Can they work with others?",
  can_trust: "Can we trust them?",
  will_grow: "Will they grow?",
  // legacy sessions
  behavioral: "Can they work with others?",
  technical: "Can they do the job?",
  culture: "Will they grow?",
};

export const CATEGORY_BLURBS: Record<string, string> = {
  can_do_job: "Role-specific ability, grounded in the tools and responsibilities in the posting.",
  solve_problems: "Situational judgement and critical thinking on realistic scenarios.",
  work_with_others: "Behaviour, communication and stakeholder management.",
  can_trust: "Ownership, accountability and professional judgement.",
  will_grow: "Motivation, learning agility and values fit.",
};

/** Maps any stored category (including legacy values) onto a five-pillar key. */
export function toPillar(value: string): PrepCategory {
  const v = String(value ?? "").toLowerCase();
  if ((PREP_CATEGORIES as readonly string[]).includes(v)) return v as PrepCategory;
  if (v.startsWith("behav")) return "work_with_others";
  if (v.startsWith("cult") || v.includes("value")) return "will_grow";
  return "can_do_job";
}
