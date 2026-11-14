/**
 * Live mock interview — shared, browser-safe logic.
 * The server owns the plan and all movement; the model only phrases messages
 * and decides follow-up vs move-on. Everything here is pure and unit-tested.
 */
import { PREP_CATEGORIES, type PrepCategory } from "./interview-prep";
import type { RoleKey } from "./role-registry";

export type InterviewLength = "short" | "standard";
export const LENGTH_QUESTIONS: Record<InterviewLength, number> = { short: 5, standard: 8 };
export const MAX_FOLLOW_UPS = 2;

export type PlanQuestion = { pillar: PrepCategory; question: string };

/**
 * Distributes main questions across the five pillars, weighted toward the
 * role's focus pillars (those with a non-empty interviewFocus entry).
 * Short = one per pillar. Standard = 8: focus pillars get a second question
 * first, remaining slots fill round-robin from the pillar order.
 */
export function planDistribution(
  length: InterviewLength,
  focus: Record<PrepCategory, string>,
): PrepCategory[] {
  const total = LENGTH_QUESTIONS[length];
  const pillars = [...PREP_CATEGORIES];
  if (total <= pillars.length) return pillars.slice(0, total);
  const out = [...pillars];
  const focusPillars = pillars.filter((p) => (focus[p] ?? "").trim().length > 0);
  const queue = focusPillars.length > 0 ? focusPillars : pillars;
  for (let i = 0; out.length < total; i++) out.push(queue[i % queue.length]!);
  return out;
}

/* ---------------- Fixed rubric (AI rates; it does not invent criteria) ---------------- */

export type InterviewCriterion = { label: string; tier: "must_have" | "good_to_have" };

export const INTERVIEW_RUBRIC: Record<PrepCategory, InterviewCriterion[]> = {
  can_do_job: [
    { label: "Shows the role-specific skills and tools the job needs", tier: "must_have" },
    { label: "Backs claims with concrete examples and numbers", tier: "must_have" },
    { label: "Understands what the role actually involves day to day", tier: "good_to_have" },
  ],
  solve_problems: [
    { label: "Structures the answer (situation, action, result)", tier: "must_have" },
    { label: "Reasons through trade-offs rather than giving a textbook answer", tier: "must_have" },
    { label: "Knows when to escalate or ask for help", tier: "good_to_have" },
  ],
  work_with_others: [
    { label: "Shows real collaboration, not just 'I work well with people'", tier: "must_have" },
    { label: "Handles disagreement or difficult stakeholders constructively", tier: "good_to_have" },
  ],
  can_trust: [
    { label: "Takes ownership ('I', not only 'we') and admits mistakes", tier: "must_have" },
    { label: "Is honest about gaps rather than bluffing", tier: "must_have" },
    { label: "Shows sound professional judgement under pressure", tier: "good_to_have" },
  ],
  will_grow: [
    { label: "Shows genuine motivation for this role, not any role", tier: "must_have" },
    { label: "Evidence of learning from feedback or failure", tier: "good_to_have" },
  ],
};

/* ---------------- Untrusted-input detection (code, not the model) ---------------- */

const INTERVIEW_STEERING: RegExp[] = [
  /\b(give|award|score|rate|mark)\s+me\s+(a\s+)?(10|ten|full|top|perfect|100)\b/i,
  /\b(pass|approve)\s+me\b/i,
  /\bskip\s+(the\s+)?(interview|questions?)\s+(and|to)\s+(the\s+)?(score|feedback|result)/i,
];

/** Interview-specific steering phrases, on top of the shared injection patterns. */
export function detectInterviewSteering(text: string): string | null {
  for (const re of INTERVIEW_STEERING) {
    const m = re.exec(text);
    if (m) {
      const start = Math.max(0, m.index - 40);
      return text.slice(start, m.index + m[0].length + 40).replace(/\s+/g, " ").trim();
    }
  }
  return null;
}

const OFFTOPIC_PATTERNS: RegExp[] = [
  /\b(write|draft|compose|generate)\s+(me\s+)?(a\s+|an\s+|some\s+)?(poem|essay|story|song|code|function|script|program|sql|regex)\b/i,
  /\b(solve|debug|fix|refactor)\s+(this\s+|my\s+)?(code|bug|function|algorithm|leetcode)\b/i,
  /\bwhat('s| is)\s+the\s+(capital|weather|time|news)\b/i,
  /\b(help\s+me\s+with|do)\s+my\s+(homework|assignment|taxes)\b/i,
];

/** True when the message asks the interviewer to act as a general chatbot. */
export function isOffTopicRequest(text: string): boolean {
  return OFFTOPIC_PATTERNS.some((re) => re.test(text));
}

const DISTRESS_PATTERNS: RegExp[] = [
  /\b(kill|end|hurt|harm)\s+(myself|me)\b/i,
  /\b(want|going)\s+to\s+die\b/i,
  /\bsuicid(e|al)\b/i,
  /\bself[- ]?harm\b/i,
  /\bno\s+reason\s+to\s+(live|go\s+on)\b/i,
  /\bcan'?t\s+go\s+on\s+anymore\b/i,
];

/** True when the message suggests real distress (not interview nerves). */
export function suggestsDistress(text: string): boolean {
  return DISTRESS_PATTERNS.some((re) => re.test(text));
}

export const STEER_BACK_MESSAGE =
  "I can't change how this interview works, but no worries — let's carry on. To remind you, the question was:";
export const OFFTOPIC_MESSAGE =
  "That's outside what I can help with here — I'm only set up to practise this interview with you. Let's get back to it:";
export const DISTRESS_MESSAGE =
  "It sounds like things might be feeling really heavy right now, and that's okay. There's no rush at all — you can step away and continue this interview whenever you're ready. If things are difficult, please consider reaching out to someone you trust, or a support line in your area. Your practice will be saved right where you left it.";

/* ---------------- Scorecard shape ---------------- */

export type ScorecardCriterion = {
  label: string;
  tier: "must_have" | "good_to_have";
  rating: "yes" | "partial" | "no" | "cannot_evaluate";
  evidence: string;
};

export type ScorecardPillar = {
  pillar: PrepCategory;
  evaluated: boolean;
  score: number | null;
  criteria: ScorecardCriterion[];
  strength: { text: string; quote: string } | null;
  improve: { text: string; quote: string } | null;
};

export type InterviewScorecard = {
  summary: string;
  pillars: ScorecardPillar[];
  weakest: Array<{ question: string; outline: string }>;
  next_practice: string;
};

const RATING_POINTS: Record<ScorecardCriterion["rating"], number | null> = {
  yes: 2,
  partial: 1,
  no: 0,
  cannot_evaluate: null,
};

const TIER_W = { must_have: 3, good_to_have: 1 } as const;

/**
 * Weighted pillar score from rated criteria. "Cannot evaluate" criteria are
 * excluded from numerator and denominator; a pillar with none evaluated is null.
 */
export function pillarScore(criteria: ScorecardCriterion[]): number | null {
  let num = 0;
  let den = 0;
  for (const c of criteria) {
    const pts = RATING_POINTS[c.rating];
    if (pts === null) continue;
    const w = TIER_W[c.tier];
    num += pts * w;
    den += 2 * w;
  }
  return den > 0 ? Math.round((num / den) * 100) : null;
}

export function isRoleKey(value: string): value is RoleKey {
  return value === "data_analyst" || value === "customer_support";
}
