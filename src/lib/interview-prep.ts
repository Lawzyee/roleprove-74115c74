export const PREP_CATEGORIES = ["behavioral", "technical", "culture"] as const;
export type PrepCategory = (typeof PREP_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  behavioral: "Behavioural",
  technical: "Role-specific / technical",
  culture: "Culture & values fit",
};
