/**
 * Single source of truth for which roles have a live simulation pipeline.
 * Browser-safe: no server imports. Generation code lives per role in
 * jd.server.ts (Data Analyst) and support.server.ts (Customer Support).
 */
export type RoleKey = "data_analyst" | "customer_support";

export type RoleDefinition = {
  key: RoleKey;
  id: string;
  name: string;
  cardTitle: string;
  cardDescription: string;
  minutes: string;
  /** Lower-case phrases matched against the AI-extracted role title. */
  keywords: string[];
  /** Role-specific steer for each interview prep pillar. */
  interviewFocus: Record<"can_do_job" | "solve_problems" | "work_with_others" | "can_trust" | "will_grow", string>;
};

export const ROLE_REGISTRY: Record<RoleKey, RoleDefinition> = {
  data_analyst: {
    key: "data_analyst",
    id: "11111111-1111-1111-1111-111111111101",
    name: "Data Analyst",
    cardTitle: "Data Analyst — Case Study Practice",
    cardDescription:
      "Work through a full case study from business framing through executive presentation. A new scenario is generated each time you start.",
    minutes: "~45-60 min",
    keywords: [
      "data analyst",
      "analytics analyst",
      "business intelligence",
      "bi analyst",
      "insights analyst",
      "reporting analyst",
      "data analytics",
    ],
    interviewFocus: {
      can_do_job: "",
      solve_problems: "",
      work_with_others: "",
      can_trust: "",
      will_grow: "",
    },
  },
  customer_support: {
    key: "customer_support",
    id: "11111111-1111-1111-1111-111111111102",
    name: "Customer Support Representative",
    cardTitle: "Customer Support — Ticket Queue Practice",
    cardDescription:
      "Read the policies, triage a real ticket export, analyse SLAs and CSAT, reply to tricky customers and brief your support lead. A new company is generated each time you start.",
    minutes: "~40-55 min",
    keywords: [
      "customer support",
      "customer service",
      "support agent",
      "support representative",
      "support specialist",
      "support advisor",
      "customer care",
      "customer experience agent",
      "customer experience associate",
      "help desk",
      "helpdesk",
      "service desk",
      "contact centre",
      "contact center",
      "call centre",
      "call center",
      "customer success associate",
      "technical support",
    ],
    interviewFocus: {
      can_do_job: "focus on handling customer scenarios, the ticketing/helpdesk tools and channels named in the posting, and applying policies accurately",
      solve_problems: "focus on de-escalating angry customers, policy edge cases and deciding when to escalate",
      work_with_others: "focus on teamwork with other agents, handovers, and escalating to engineering, billing or a team lead",
      can_trust: "focus on reliability, honesty with customers (no over-promising), handling pressure and SLA targets",
      will_grow: "focus on growth in support — learning products quickly, feedback from QA/CSAT, and career progression",
    },
  },
};

export const LIVE_ROLES: RoleDefinition[] = Object.values(ROLE_REGISTRY);
export const LIVE_ROLE_IDS = LIVE_ROLES.map((r) => r.id);

export function roleKeyForId(roleId: string | null | undefined): RoleKey | null {
  return LIVE_ROLES.find((r) => r.id === roleId)?.key ?? null;
}

/**
 * The one role-matching implementation, used by JD paste and interview prep.
 * Returns null for unrelated postings (they fall back to the "no match" flow).
 */
export function matchRoleKey(roleType: string, confidence: number): RoleKey | null {
  if (!(confidence >= 0.5)) return null;
  const role = roleType.toLowerCase();
  for (const def of LIVE_ROLES) {
    if (def.keywords.some((k) => role.includes(k))) return def.key;
  }
  return null;
}
