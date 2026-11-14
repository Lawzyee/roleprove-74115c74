import type { GenericScenario } from "./generic-scenarios";

/** Business scenarios used to seed a fresh generic Customer Support simulation on every start. */
export const SUPPORT_SCENARIOS: GenericScenario[] = [
  {
    id: "saas_software",
    company_context: "A B2B SaaS company selling project-management software to small agencies. Support covers login, billing and integration issues.",
    emphasis_themes: ["integration and bug reports", "annual plan refunds", "account access and SSO"],
    skills: ["Zendesk", "email and chat support", "troubleshooting", "escalation to engineering"],
    responsibilities: ["Resolve customer tickets within SLA", "Escalate bugs with clear reproduction steps", "Keep CSAT high"],
  },
  {
    id: "ecommerce_retailer",
    company_context: "An online fashion retailer shipping across the UK and EU. Support handles orders, deliveries and returns.",
    emphasis_themes: ["late and lost deliveries", "returns and refunds within a 30-day window", "peak-season volume"],
    skills: ["Gorgias", "order management", "refund processing", "live chat"],
    responsibilities: ["Handle order and delivery queries", "Process returns under policy", "Flag courier problems"],
  },
  {
    id: "telecom_provider",
    company_context: "A mobile and broadband provider with prepaid and contract customers. Support works across phone, chat and email.",
    emphasis_themes: ["network outages", "billing disputes and bill shock", "contract cancellations"],
    skills: ["Salesforce Service Cloud", "phone support", "de-escalation", "retention offers"],
    responsibilities: ["Resolve billing and connectivity issues", "Follow outage scripts", "Retain at-risk customers"],
  },
  {
    id: "fintech_app",
    company_context: "A consumer fintech app offering a current account and debit card, regulated by the FCA.",
    emphasis_themes: ["card freezes and fraud reports", "failed transfers", "identity verification delays"],
    skills: ["Intercom", "KYC procedures", "fraud escalation", "compliant communication"],
    responsibilities: ["Handle account and payment issues", "Escalate suspected fraud immediately", "Never promise outcomes compliance must decide"],
  },
  {
    id: "travel_booking",
    company_context: "An online travel agency selling flights and hotels. Support handles changes, cancellations and disruption.",
    emphasis_themes: ["flight cancellations and rebooking", "refund eligibility by fare type", "urgent same-day travel issues"],
    skills: ["Freshdesk", "booking systems", "phone and chat", "policy interpretation"],
    responsibilities: ["Rebook disrupted travellers", "Apply fare refund rules", "Prioritise customers travelling within 24 hours"],
  },
  {
    id: "food_delivery",
    company_context: "A food delivery platform connecting customers, restaurants and couriers in five cities.",
    emphasis_themes: ["missing or wrong items", "late deliveries and credits", "restaurant and courier complaints"],
    skills: ["Kustomer", "live chat", "credit and refund rules", "high-volume multitasking"],
    responsibilities: ["Resolve order issues quickly", "Apply credit policy consistently", "Report repeat restaurant problems"],
  },
  {
    id: "online_education",
    company_context: "An online learning platform selling courses and subscriptions to adult learners and companies.",
    emphasis_themes: ["course access problems", "subscription cancellations and refunds", "certificate issues"],
    skills: ["Help Scout", "email support", "subscription billing", "knowledge base writing"],
    responsibilities: ["Fix learner access issues", "Handle refund requests under policy", "Improve help articles"],
  },
  {
    id: "healthcare_booking",
    company_context: "A healthcare appointment booking service for private clinics. Support helps patients book, move and cancel appointments.",
    emphasis_themes: ["missed appointment fees", "booking system errors", "sensitive patient data"],
    skills: ["Zendesk", "phone support", "data protection", "empathetic communication"],
    responsibilities: ["Help patients manage bookings", "Apply cancellation-fee policy fairly", "Handle personal data carefully"],
  },
];

export function pickSupportScenario(): GenericScenario {
  return SUPPORT_SCENARIOS[Math.floor(Math.random() * SUPPORT_SCENARIOS.length)]!;
}
