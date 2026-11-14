import { describe, expect, it } from "vitest";
import { matchRoleKey, ROLE_REGISTRY, LIVE_ROLE_IDS } from "./role-registry";
import {
  TICKET_COLUMNS, duplicateTickets, missingPriority, impossibleTimes, slaCritical, urgentOrder,
  slaBreachRate, topCategories, slowestChannels,
} from "./support-metrics";
import { gradeTextField } from "./grading.server";

describe("role matching", () => {
  it("maps support titles to Customer Support", () => {
    for (const t of ["Customer Support Representative", "Customer Service Advisor", "Support Agent", "Senior Customer Care Agent"]) {
      expect(matchRoleKey(t, 0.9)).toBe("customer_support");
    }
  });
  it("keeps Data Analyst matching", () => {
    expect(matchRoleKey("Data Analyst", 0.9)).toBe("data_analyst");
  });
  it("unrelated or low-confidence roles do not match", () => {
    expect(matchRoleKey("Software Engineer", 0.9)).toBeNull();
    expect(matchRoleKey("Customer Support", 0.3)).toBeNull();
  });
  it("both roles are live", () => {
    expect(LIVE_ROLE_IDS).toEqual([ROLE_REGISTRY.data_analyst.id, ROLE_REGISTRY.customer_support.id]);
  });
});

const row = (id: string, date: string, channel: string, category: string, priority: string, status: string, frt: string, res: string, tier: string, csat: string) =>
  ({ ticket_id: id, created_date: date, channel, category, priority, status, first_response_mins: frt, resolution_hours: res, customer_tier: tier, csat });
const ds = {
  name: "support_tickets",
  columns: TICKET_COLUMNS,
  rows: [
    row("T-1", "2026-01-05", "email", "billing", "urgent", "open", "90", "", "premium", ""),
    row("T-2", "2026-01-03", "chat", "billing", "urgent", "pending", "30", "", "free", ""),
    row("T-2", "2026-01-03", "chat", "billing", "urgent", "pending", "30", "", "free", ""),
    row("T-3", "2026-01-06", "phone", "login", "", "resolved", "10", "2", "free", "5"),
    row("T-4", "2026-01-12", "email", "login", "high", "open", "-5", "", "free", ""),
    row("T-5", "2026-01-13", "chat", "delivery", "low", "closed", "120", "1", "premium", "2"),
  ],
};
const sla = { urgent: 60, high: 240, medium: 480, low: 1440 };

describe("support figures come from the rows", () => {
  it("counts triage issues", () => {
    expect(duplicateTickets(ds)).toBe(1);
    expect(missingPriority(ds)).toBe(1);
    expect(impossibleTimes(ds)).toBe(2); // T-4 negative, T-5 resolved in 60 mins < 120 first response
    expect(slaCritical(ds)).toBe(3);
    expect(urgentOrder(ds)).toEqual(["T-2", "T-1"]);
  });
  it("computes SLA breach rate over valid tickets", () => {
    // eligible: T-1 (breach), T-2 (ok), T-5 (ok) -> 33.3%
    expect(slaBreachRate(ds, sla)).toBe(33.3);
  });
  it("finds the top category and slowest channel", () => {
    expect(topCategories(ds)).toEqual(["billing", "login"]); // tie: both accepted
    expect(slowestChannels(ds)).toEqual(["email"]);
  });
});

describe("text answers", () => {
  it("full marks for right order, half for right set", () => {
    const f = { type: "id_list", answer: "T-2, T-1", answer_list: ["T-2", "T-1"], points: 2 };
    expect(gradeTextField(f, "t-2 then T-1").score).toBe(2);
    expect(gradeTextField(f, "T-1, T-2").score).toBe(1);
    expect(gradeTextField(f, "T-1").score).toBe(0);
  });
  it("accepts a category name case-insensitively", () => {
    expect(gradeTextField({ type: "text", answer: "billing", accepted: ["billing"], points: 2 }, "Billing").score).toBe(2);
    expect(gradeTextField({ type: "text", answer: "billing", accepted: ["billing"], points: 2 }, "login").score).toBe(0);
  });
});
