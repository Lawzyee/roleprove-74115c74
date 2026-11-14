/**
 * Customer Support Representative pipeline. Same engine shape as Data Analyst:
 * one AI pass writes the company, policies, ticket export and customer messages;
 * every structured answer and summary table is then computed in code from the rows.
 */
import { callAi, type Extracted, type GeneratedSimulation, type GeneratedStage, type StageRubric } from "./jd.server";
import type { Dataset } from "./jd-aggregates";
import {
  TICKET_COLUMNS,
  PRIORITIES,
  type SlaTargets,
  assertUsableTicketData,
  categoryTable,
  channelTable,
  duplicateTickets,
  impossibleTimes,
  missingPriority,
  slaBreachRate,
  slaCritical,
  slowestChannels,
  tierTable,
  topCategories,
  urgentOrder,
  weeklyTable,
} from "./support-metrics";

const DEFAULT_SLA: SlaTargets = { urgent: 60, high: 240, medium: 480, low: 1440 };

export const SUPPORT_BONUS_STAGES: Array<{ kind: string; label: string; test: RegExp }> = [
  { kind: "escalation_handling", label: "Escalation handling", test: /escalat|tier 2|second line|complaints? handling/i },
  { kind: "live_chat_multitasking", label: "Live-chat multitasking", test: /live chat|multiple chats|concurrent|multitask/i },
  { kind: "technical_troubleshooting", label: "Technical troubleshooting", test: /troubleshoot|technical support|debug|diagnos|api|integration/i },
  { kind: "billing_disputes", label: "Refund and billing disputes", test: /refund|billing|chargeback|dispute|payment issue/i },
  { kind: "multilingual_support", label: "Multilingual support", test: /multilingual|bilingual|fluent in|language skills|french|spanish|german|arabic|portuguese|yoruba|swahili/i },
  { kind: "customer_success", label: "Onboarding and customer success", test: /onboard|customer success|adoption|account management|retention/i },
];

export function detectSupportBonusStages(extracted: Extracted) {
  const haystack = [extracted.role_type, extracted.company_context, ...extracted.skills, ...extracted.responsibilities, ...extracted.emphasis_themes].join(" ");
  return SUPPORT_BONUS_STAGES.filter((b) => b.test.test(haystack)).slice(0, 2);
}

const REPLY_CRITERIA = [
  "Empathy and tone: acknowledges how the customer feels and follows the company's tone guidelines.",
  "Accuracy against policy: anything offered or refused matches the stated policy exactly.",
  "Clear next steps: the customer knows exactly what happens next, who does it and by when.",
  "Prioritisation and escalation: escalates or prioritises correctly when the situation requires it, and says so.",
  "No invented promises: does not promise refunds, timelines or outcomes the policy does not allow.",
];

const PROSE_FALLBACK = [
  "Engages directly with this company, its policies and its data.",
  "Reasoning is structured and easy to follow.",
  "Points are supported by specific evidence from the brief or tables.",
  "Next steps are concrete and actionable.",
];

function written(raw: any, key: string, label: string, fallbackPrompt: string, points: number, criteria?: string[]) {
  const prompt = String(raw?.prompt ?? "").trim() || fallbackPrompt;
  let list = criteria ?? (Array.isArray(raw?.criteria) ? raw.criteria.map(String).filter(Boolean).slice(0, 6) : []);
  if (list.length < 3) list = [...list, ...PROSE_FALLBACK].slice(0, 5);
  return { key, label, prompt, criteria: list, points, input: "prose" as const };
}

function normaliseSla(raw: any): SlaTargets {
  const t = PRIORITIES.map((p) => Number(raw?.[p]));
  const ok = t.every((n) => Number.isFinite(n) && n > 0) && t.every((n, i) => i === 0 || n >= t[i - 1]!);
  return ok ? { urgent: t[0]!, high: t[1]!, medium: t[2]!, low: t[3]! } : DEFAULT_SLA;
}

function normaliseTickets(raw: any): Dataset {
  const rows = (Array.isArray(raw) ? raw : []).map((r: any) => {
    const row: Record<string, string> = {};
    for (const c of TICKET_COLUMNS) row[c.key] = r?.[c.key] === undefined || r?.[c.key] === null ? "" : String(r[c.key]);
    return row;
  });
  return { name: "support_tickets", columns: TICKET_COLUMNS, rows };
}

const minsLabel = (m: number) => (m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`);

export async function generateSupportCaseStudy(extracted: Extracted): Promise<GeneratedSimulation> {
  const themes = extracted.emphasis_themes.length ? extracted.emphasis_themes : extracted.skills.slice(0, 5);
  const bonus = detectSupportBonusStages(extracted);

  const parsed = await callAi(
    "You design realistic, hands-on Customer Support Representative assessments. Every generation must be original: new company, product, customers, ticket ids, dates and numbers. Reply with JSON only.",
    [
      `JOB POSTING CONTEXT:\nRole: ${extracted.role_type}\nSeniority: ${extracted.seniority}\nCompany context: ${extracted.company_context}\nTools/skills: ${extracted.skills.join(", ")}\nResponsibilities: ${extracted.responsibilities.join("; ")}\nEMPHASIS (must shape the categories, channels, policies and customer messages): ${themes.join("; ")}`,
      "",
      `Randomisation seed: ${Math.random().toString(36).slice(2)}-${Date.now()}`,
      "",
      "Reply as JSON exactly in this shape:",
      JSON.stringify({
        title: "<short simulation title naming the company>",
        description: "<1-2 sentences>",
        company_name: "<fictional company>",
        situation_brief: "<3-5 sentences: the company, the product, the support team and what the support lead cares about this week>",
        policies: {
          sla_first_response_mins: { urgent: 60, high: 240, medium: 480, low: 1440 },
          refund_rule: "<one precise refund rule with a number, e.g. full refund within 14 days of purchase, store credit after>",
          escalation_rule: "<when an agent must escalate and to whom>",
          tone_guidelines: "<2-3 tone rules>",
          other_rules: ["<1-2 extra rules specific to this business>"],
        },
        tickets: [
          { ticket_id: "T-1001", created_date: "YYYY-MM-DD", channel: "email|chat|phone", category: "<short category>", priority: "urgent|high|medium|low", status: "open|pending|escalated|resolved|closed", first_response_mins: 35, resolution_hours: 6.5, customer_tier: "<e.g. free|standard|premium>", csat: 4 },
        ],
        customer_messages: {
          angry: { ticket_id: "<an existing ticket id>", customer_name: "<name>", message: "<an angry customer's message, 3-6 sentences>" },
          policy_edge: { ticket_id: "<an existing ticket id>", customer_name: "<name>", message: "<a request that sits just outside the refund or another policy>" },
          escalation: { ticket_id: "<an existing ticket id>", customer_name: "<name>", message: "<an issue that must be escalated under the escalation rule>" },
        },
        situation_question: { prompt: "<ask the candidate to summarise the policies they must apply and what matters most to customers and the business>", criteria: ["…", "…", "…", "…"] },
        data_review_question: { prompt: "<ask what problems they see in the export and what they would check before trusting it>", criteria: ["…", "…", "…", "…"] },
        manager_question: { prompt: "<ask for a short summary to the support lead: what is wrong, what to fix first, what they need from the team>", criteria: ["…", "…", "…", "…"] },
        bonus_stages: [{ kind: "<requested bonus kind>", title: "<title>", brief: "<scenario grounded in this company>", question: { prompt: "<question>", criteria: ["…", "…", "…", "…"] } }],
      }),
      "",
      "Ticket rules: 22-30 rows spanning 3-5 consecutive weeks; 4-6 categories; channels only email, chat or phone; 2-3 customer tiers; csat 1-5 or blank for unrated.",
      "Include realistic data problems: 2-3 exact or near duplicate rows reusing an existing ticket_id; 2-3 blank or invalid priorities (e.g. 'URG?'); 2-3 impossible times (negative first_response_mins, or resolution_hours shorter than the first response); 1-2 obviously miscategorised tickets.",
      "Exactly 3-5 tickets must be open (status open, pending or escalated) with priority urgent. Several first responses must exceed the SLA target for their priority.",
      "SLA targets are in minutes and must increase from urgent to low.",
      bonus.length ? `Bonus stages to write (the posting emphasises them): ${bonus.map((b) => `${b.kind} (${b.label})`).join(", ")}.` : "Return bonus_stages as an empty array.",
    ].join("\n"),
  );

  const dataset = normaliseTickets(parsed.tickets);
  assertUsableTicketData(dataset);
  const sla = normaliseSla(parsed.policies?.sla_first_response_mins);
  const p = parsed.policies ?? {};
  const company = String(parsed.company_name ?? "the company").trim() || "the company";

  const policyText = [
    "SUPPORT POLICIES",
    `• First-response SLA: urgent ${minsLabel(sla.urgent)}, high ${minsLabel(sla.high)}, medium ${minsLabel(sla.medium)}, low ${minsLabel(sla.low)}.`,
    p.refund_rule ? `• Refunds: ${String(p.refund_rule).trim()}` : "",
    p.escalation_rule ? `• Escalation: ${String(p.escalation_rule).trim()}` : "",
    p.tone_guidelines ? `• Tone: ${String(p.tone_guidelines).trim()}` : "",
    ...(Array.isArray(p.other_rules) ? p.other_rules.slice(0, 2).map((r: unknown) => `• ${String(r).trim()}`) : []),
  ]
    .filter(Boolean)
    .join("\n");

  // Stage 1
  const stage1: GeneratedStage = {
    title: "Understand the situation",
    brief: [String(parsed.situation_brief ?? "").trim(), "", policyText].join("\n").trim(),
    task_type: "case",
    rubric_criteria: {
      max_score: 10,
      stage_kind: "support_situation",
      written: [written(parsed.situation_question, "situation", "Your summary", "Summarise the policies you must apply and what matters most to customers and the business.", 10)],
    },
  };

  // Stage 2 — full export for the CSV download and on-screen preview.
  const stage2: GeneratedStage = {
    title: "Review the support data",
    brief: `This is last month's ticket export from ${company}'s helpdesk. Download the CSV or read the preview below. Nothing has been cleaned yet.`,
    task_type: "case",
    rubric_criteria: {
      max_score: 10,
      stage_kind: "support_data_review",
      datasets: [dataset],
      written: [written(parsed.data_review_question, "data_review", "Question", "What problems do you see in this export, and what would you check before trusting it?", 10)],
    },
  };

  // Stage 3 — every answer computed from the rows.
  const order = urgentOrder(dataset);
  const stage3Fields: StageRubric["fields"] = [
    { key: "duplicate_tickets", label: "How many extra rows repeat a ticket ID that already appears?", type: "number", answer: duplicateTickets(dataset), points: 1 },
    { key: "missing_priority", label: "After removing duplicates, how many tickets have a blank or invalid priority?", type: "number", answer: missingPriority(dataset), points: 1 },
    { key: "impossible_times", label: "How many tickets have impossible times (a negative time, or resolved faster than the first response)?", type: "number", answer: impossibleTimes(dataset), points: 2 },
    { key: "sla_critical", label: "How many tickets are SLA-critical (still open, pending or escalated, with urgent or high priority)?", type: "number", answer: slaCritical(dataset), points: 1 },
    { key: "urgent_order", label: "List the open urgent ticket IDs in the order you'd handle them (oldest first).", type: "id_list", answer: order.join(", "), answer_list: order, points: 2 } as any,
  ];
  const stage3: GeneratedStage = {
    title: "Triage and prepare",
    brief: [
      "Use the ticket export from Stage 2. Treat a repeated ticket ID as a duplicate and keep its first row. Open means status open, pending or escalated.",
      "Answer in words or numbers — whatever is clearest.",
    ].join("\n"),
    task_type: "case",
    rubric_criteria: {
      max_score: 10,
      stage_kind: "support_triage",
      datasets: [dataset],
      fields: stage3Fields,
      written: [
        written(null, "first_pick", "Question", "Which single ticket would you pick up first right now, and why?", 3, [
          "Picks an open urgent ticket at greatest SLA risk, citing its ID.",
          "Justifies the choice with priority, age or customer impact from the data.",
          "Notes any data problem that could change the order.",
        ]),
      ],
      deliverable: { label: "Upload your cleaned ticket list (optional)", hint: "CSV or XLSX. Stored as a work sample — it does not change your score.", accept: [".csv", ".xlsx"] },
    },
  };

  // Stage 4 — tables and answers computed from the same rows.
  const tables = [channelTable(dataset, sla), categoryTable(dataset), tierTable(dataset), weeklyTable(dataset, sla)].filter(Boolean) as NonNullable<StageRubric["tables"]>;
  const tops = topCategories(dataset);
  const slow = slowestChannels(dataset);
  const stage4: GeneratedStage = {
    title: "Analyse",
    brief: `These tables were built from the de-duplicated tickets. A ticket counts towards the SLA breach rate only if it has a valid priority and a valid, non-negative first response time; it breaches when the first response is longer than the target for its priority (urgent ${sla.urgent}, high ${sla.high}, medium ${sla.medium}, low ${sla.low} minutes).`,
    task_type: "case",
    rubric_criteria: {
      max_score: 10,
      stage_kind: "support_analysis",
      datasets: [dataset],
      tables,
      fields: [
        { key: "sla_breach_rate", label: "What is the overall first-response SLA breach rate (%)?", type: "number", answer: slaBreachRate(dataset, sla), tolerance: 1, points: 2 },
        { key: "top_category", label: "Which category has the most tickets?", type: "text", answer: tops[0]!, accepted: tops, points: 2 } as any,
        { key: "slowest_channel", label: "Which channel has the slowest average first response?", type: "text", answer: slow[0]!, accepted: slow, points: 2 } as any,
      ],
      written: [
        written(null, "trend", "Question", "What is driving SLA breaches and low CSAT here? Cite figures from the tables, including the weekly trend.", 4, [
          "Identifies the biggest driver using figures that appear in the tables.",
          "Connects response times or categories to CSAT by tier.",
          "Describes the weekly trend accurately.",
          "Avoids claims the data cannot support.",
        ]),
      ],
    },
  };

  // Stage 5 — replies to three real tickets plus a process fix.
  const ids = dataset.rows.map((r) => r.ticket_id);
  const msgs = parsed.customer_messages ?? {};
  const msg = (k: string, fallbackId: string) => {
    const m = msgs[k] ?? {};
    const id = ids.includes(String(m.ticket_id)) ? String(m.ticket_id) : fallbackId;
    return { id, name: String(m.customer_name ?? "The customer").trim(), text: String(m.message ?? "").trim() };
  };
  const angry = msg("angry", order[0] ?? ids[0]!);
  const edge = msg("policy_edge", ids[3] ?? ids[0]!);
  const esc = msg("escalation", order[1] ?? ids[1]!);
  if (!angry.text || !edge.text || !esc.text) throw new Error("Customer messages were incomplete.");
  const reply = (key: string, label: string, m: typeof angry, pts: number) =>
    written(null, key, label, `Ticket ${m.id} — ${m.name} wrote:\n"${m.text}"\n\nWrite your reply to this customer.`, pts, REPLY_CRITERIA);
  const stage5: GeneratedStage = {
    title: "Customer responses and recommendations",
    brief: ["Reply to three customers, then recommend a process fix for the biggest problem you found.", "", policyText].join("\n"),
    task_type: "case",
    rubric_criteria: {
      max_score: 10,
      stage_kind: "support_responses",
      written: [
        reply("reply_angry", "Reply 1 — upset customer", angry, 2),
        reply("reply_policy", "Reply 2 — policy edge case", edge, 2),
        reply("reply_escalation", "Reply 3 — needs escalation", esc, 2),
        written(null, "process_fix", "Process fix", "What process change would fix the biggest problem in this queue? Say what to change, who owns it and how you'd measure it.", 4, [
          "Targets the biggest problem shown by the Stage 4 data.",
          "Proposes a specific, realistic change with an owner.",
          "Defines how success would be measured.",
          "Considers the impact on customers and agents.",
        ]),
      ],
    },
  };

  // Stage 6
  const stage6: GeneratedStage = {
    title: "Manager review",
    brief: `Your support lead at ${company} has five minutes before the weekly team meeting. Write the short summary you'd send them.`,
    task_type: "case",
    rubric_criteria: {
      max_score: 10,
      stage_kind: "support_manager_review",
      written: [written(parsed.manager_question, "manager_summary", "Your summary", "Summarise what is wrong, what to fix first, and what you need from the team.", 10)],
      deliverable: { label: "Upload a summary document (optional)", hint: "PDF or DOCX. Stored as a work sample — it does not change your score.", accept: [".pdf", ".docx"] },
    },
  };

  const bonusKinds = new Set(bonus.map((b) => b.kind));
  const bonusStages: GeneratedStage[] = (Array.isArray(parsed.bonus_stages) ? parsed.bonus_stages : [])
    .filter((b: any) => bonusKinds.has(String(b?.kind)) && String(b?.question?.prompt ?? "").trim())
    .slice(0, 2)
    .map((b: any) => ({
      title: String(b.title ?? b.kind).trim(),
      brief: [String(b.brief ?? "").trim(), "", policyText].join("\n").trim(),
      task_type: "case" as const,
      rubric_criteria: { max_score: 10, stage_kind: String(b.kind), written: [written(b.question, "bonus", "Question", "", 10)] },
    }));

  return {
    title: String(parsed.title ?? "").trim() || `${company} — support queue`,
    description: String(parsed.description ?? "").trim(),
    tasks: [stage1, stage2, stage3, stage4, stage5, stage6, ...bonusStages],
  };
}

export async function generateSupportCaseStudyWithRetry(extracted: Extracted): Promise<GeneratedSimulation> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));
    try {
      return await generateSupportCaseStudy(extracted);
    } catch (error) {
      lastError = error;
      console.error(`[support] generation attempt ${attempt + 1} failed:`, error instanceof Error ? error.message : error);
    }
  }
  console.error("[support] generation failed", lastError);
  throw new Error("We couldn't build a reliable support simulation just now. Please try again in a moment.");
}
