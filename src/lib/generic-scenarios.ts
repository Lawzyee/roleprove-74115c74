export type GenericScenario = {
  id: string;
  company_context: string;
  emphasis_themes: string[];
  skills: string[];
  responsibilities: string[];
};

/** Business scenarios used to seed a fresh generic Data Analyst case study on every start. */
export const GENERIC_SCENARIOS: GenericScenario[] = [
  {
    id: "subscription_saas",
    company_context:
      "A mid-sized B2B SaaS company selling subscription software to small businesses. The analytics team supports revenue and customer success.",
    emphasis_themes: [
      "monthly recurring revenue and churn",
      "subscription billing data validation",
      "customer segmentation by plan tier",
      "stakeholder-ready reporting",
    ],
    skills: ["SQL", "Excel", "data cleaning", "dashboarding", "stakeholder communication"],
    responsibilities: [
      "Investigate revenue reporting discrepancies",
      "Clean and validate billing exports",
      "Report subscription trends to commercial leadership",
    ],
  },
  {
    id: "ecommerce_retail",
    company_context:
      "An online homeware retailer with a growing marketplace channel. Analysts sit between merchandising and operations.",
    emphasis_themes: [
      "order and returns data quality",
      "category-level sales performance",
      "delivery and fulfilment metrics",
      "promotion effectiveness",
    ],
    skills: ["SQL", "Python or Excel", "data validation", "commercial analysis", "visualisation"],
    responsibilities: [
      "Track category sales and returns",
      "Investigate anomalies in order data",
      "Recommend actions to merchandising",
    ],
  },
  {
    id: "healthcare_clinics",
    company_context:
      "A network of private outpatient clinics. The data team reports on appointment capacity, attendance and patient outcomes.",
    emphasis_themes: [
      "appointment and attendance data quality",
      "clinic utilisation and no-show rates",
      "waiting time analysis",
      "communicating with non-technical clinical staff",
    ],
    skills: ["SQL", "Excel", "data governance", "operational reporting"],
    responsibilities: [
      "Validate appointment records across sites",
      "Report utilisation and no-show trends",
      "Advise operations on capacity",
    ],
  },
  {
    id: "fintech_payments",
    company_context:
      "A payments fintech processing card transactions for small merchants. Analysts support risk and finance reporting.",
    emphasis_themes: [
      "transaction data reconciliation",
      "chargeback and failure rates",
      "merchant segmentation",
      "finance versus dashboard discrepancies",
    ],
    skills: ["SQL", "reconciliation", "data quality", "risk reporting", "stakeholder communication"],
    responsibilities: [
      "Reconcile transaction and settlement data",
      "Monitor failure and chargeback rates",
      "Explain variances to finance",
    ],
  },
  {
    id: "membership_fitness",
    company_context:
      "A gym and leisure membership operator with sites across several cities. Analytics supports membership growth and retention.",
    emphasis_themes: [
      "membership joins, freezes and cancellations",
      "EPOS and membership system data validation",
      "site-level performance comparison",
      "retention reporting for regional managers",
    ],
    skills: ["SQL", "Excel", "data cleaning", "retention analysis", "reporting"],
    responsibilities: [
      "Clean membership exports from multiple systems",
      "Report retention by site and tier",
      "Recommend retention interventions",
    ],
  },
  {
    id: "logistics_delivery",
    company_context:
      "A last-mile delivery company operating regional depots for retail clients. Analysts support operations and client reporting.",
    emphasis_themes: [
      "delivery scan and route data quality",
      "on-time delivery performance",
      "depot and client segmentation",
      "cost per delivery analysis",
    ],
    skills: ["SQL", "Excel", "operational analytics", "visualisation"],
    responsibilities: [
      "Validate delivery scan data",
      "Report on-time performance by depot",
      "Investigate cost anomalies",
    ],
  },
  {
    id: "media_subscriptions",
    company_context:
      "A digital news publisher with an ad-funded free tier and a paid digital subscription product.",
    emphasis_themes: [
      "subscriber acquisition and cancellation data",
      "content engagement metrics",
      "campaign and channel performance",
      "editorial stakeholder reporting",
    ],
    skills: ["SQL", "engagement analytics", "data cleaning", "commercial interpretation"],
    responsibilities: [
      "Clean subscription and engagement exports",
      "Report acquisition performance by channel",
      "Advise editorial and marketing leads",
    ],
  },
  {
    id: "energy_utilities",
    company_context:
      "A domestic energy supplier managing metered accounts and tariff switching for household customers.",
    emphasis_themes: [
      "meter reading data validation",
      "tariff and billing accuracy",
      "customer segmentation by consumption",
      "regulatory reporting quality",
    ],
    skills: ["SQL", "data quality", "billing analysis", "reporting"],
    responsibilities: [
      "Validate meter and billing records",
      "Investigate billing discrepancies",
      "Report consumption trends",
    ],
  },
];

export function pickGenericScenario(): GenericScenario {
  return GENERIC_SCENARIOS[Math.floor(Math.random() * GENERIC_SCENARIOS.length)]!;
}
