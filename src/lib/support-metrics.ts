/**
 * Customer Support figures, computed in code from the generated ticket export.
 * Every answer key and summary table for the Customer Support role comes from here —
 * the AI's own numbers are never shown or graded.
 */
import type { Dataset, DatasetRow, SummaryTable } from "./jd-aggregates";

export const TICKET_COLUMNS = [
  { key: "ticket_id", label: "Ticket ID" },
  { key: "created_date", label: "Created date" },
  { key: "channel", label: "Channel" },
  { key: "category", label: "Category" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "first_response_mins", label: "First response (mins)" },
  { key: "resolution_hours", label: "Resolution (hours)" },
  { key: "customer_tier", label: "Customer tier" },
  { key: "csat", label: "CSAT (1-5)" },
];

export const PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export type SlaTargets = Record<Priority, number>;
export const CHANNELS = ["email", "chat", "phone"];
const CLOSED = ["resolved", "closed"];

const s = (v: unknown) => String(v ?? "").trim();
const lower = (v: unknown) => s(v).toLowerCase();
const blank = (v: unknown) => ["", "(blank)", "n/a", "null", "-"].includes(lower(v));
function num(v: unknown) {
  const raw = s(v);
  if (!raw || !/\d/.test(raw)) return NaN;
  const n = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
const round1 = (n: number) => Math.round(n * 10) / 10;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** First occurrence of each ticket id; later rows with the same id are duplicates. */
export function uniqueTickets(ds: Dataset): DatasetRow[] {
  const seen = new Set<string>();
  const out: DatasetRow[] = [];
  for (const r of ds.rows) {
    const id = lower(r.ticket_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
  }
  return out;
}

export const validPriority = (r: DatasetRow): Priority | null =>
  (PRIORITIES as readonly string[]).includes(lower(r.priority)) ? (lower(r.priority) as Priority) : null;
export const isOpen = (r: DatasetRow) => !CLOSED.includes(lower(r.status));

export function duplicateTickets(ds: Dataset) {
  return ds.rows.filter((r) => !blank(r.ticket_id)).length - uniqueTickets(ds).length;
}

export function missingPriority(ds: Dataset) {
  return uniqueTickets(ds).filter((r) => !validPriority(r)).length;
}

/** Negative times, or a resolution time shorter than the first response. */
export function impossibleTimes(ds: Dataset) {
  return uniqueTickets(ds).filter((r) => {
    const f = num(r.first_response_mins);
    const res = num(r.resolution_hours);
    if (Number.isFinite(f) && f < 0) return true;
    if (Number.isFinite(res) && res < 0) return true;
    return Number.isFinite(f) && Number.isFinite(res) && f >= 0 && res >= 0 && res * 60 < f;
  }).length;
}

/** Open tickets with urgent or high priority. */
export function slaCritical(ds: Dataset) {
  return uniqueTickets(ds).filter((r) => isOpen(r) && ["urgent", "high"].includes(validPriority(r) ?? "")).length;
}

/** Open urgent tickets, oldest first (ties by ticket id). */
export function urgentOrder(ds: Dataset): string[] {
  return uniqueTickets(ds)
    .filter((r) => isOpen(r) && validPriority(r) === "urgent")
    .sort((a, b) => s(a.created_date).localeCompare(s(b.created_date)) || s(a.ticket_id).localeCompare(s(b.ticket_id)))
    .map((r) => s(r.ticket_id));
}

function slaEligible(ds: Dataset) {
  return uniqueTickets(ds).filter((r) => {
    const f = num(r.first_response_mins);
    return validPriority(r) && Number.isFinite(f) && f >= 0;
  });
}
const breached = (r: DatasetRow, t: SlaTargets) => num(r.first_response_mins) > t[validPriority(r)!];

/** % of tickets (valid priority + valid first response) that missed the first-response target. */
export function slaBreachRate(ds: Dataset, targets: SlaTargets) {
  const rows = slaEligible(ds);
  if (!rows.length) return 0;
  return round1((rows.filter((r) => breached(r, targets)).length / rows.length) * 100);
}

function countBy(rows: DatasetRow[], key: string) {
  const m = new Map<string, DatasetRow[]>();
  for (const r of rows) {
    const k = lower(r[key]);
    if (blank(k)) continue;
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return m;
}
const avg = (vals: number[]) => (vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : NaN);
const fmt = (n: number) => (Number.isFinite(n) ? String(n) : "—");
const validFrt = (rows: DatasetRow[]) => rows.map((r) => num(r.first_response_mins)).filter((n) => Number.isFinite(n) && n >= 0);
const validCsat = (rows: DatasetRow[]) => rows.map((r) => num(r.csat)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);

/** Categories with the most tickets (all tied leaders). */
export function topCategories(ds: Dataset): string[] {
  const groups = [...countBy(uniqueTickets(ds), "category")];
  const max = Math.max(0, ...groups.map(([, r]) => r.length));
  return groups.filter(([, r]) => r.length === max).map(([k]) => k);
}

/** Channels with the highest average first response time (all tied). */
export function slowestChannels(ds: Dataset): string[] {
  const groups = [...countBy(uniqueTickets(ds), "channel")]
    .filter(([k]) => CHANNELS.includes(k))
    .map(([k, r]) => [k, avg(validFrt(r))] as const)
    .filter(([, a]) => Number.isFinite(a));
  const max = Math.max(...groups.map(([, a]) => a));
  return groups.filter(([, a]) => a === max).map(([k]) => k);
}

export function channelTable(ds: Dataset, targets: SlaTargets): SummaryTable {
  const eligible = new Set(slaEligible(ds));
  const rows = [...countBy(uniqueTickets(ds), "channel")].map(([k, r]) => {
    const el = r.filter((x) => eligible.has(x));
    return {
      channel: k,
      tickets: String(r.length),
      avg_first_response: fmt(avg(validFrt(r))),
      avg_resolution: fmt(avg(r.map((x) => num(x.resolution_hours)).filter((n) => Number.isFinite(n) && n >= 0))),
      sla_breach: el.length ? `${round1((el.filter((x) => breached(x, targets)).length / el.length) * 100)}%` : "—",
    };
  });
  return {
    title: "Response time by channel",
    columns: [
      { key: "channel", label: "Channel" },
      { key: "tickets", label: "Tickets" },
      { key: "avg_first_response", label: "Avg first response (mins)" },
      { key: "avg_resolution", label: "Avg resolution (hours)" },
      { key: "sla_breach", label: "SLA breach rate" },
    ],
    rows,
  };
}

export function categoryTable(ds: Dataset): SummaryTable {
  const unique = uniqueTickets(ds);
  const rows = [...countBy(unique, "category")]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, r]) => ({
      category: k,
      tickets: String(r.length),
      share: `${round1((r.length / unique.length) * 100)}%`,
      avg_csat: fmt(avg(validCsat(r))),
    }));
  return {
    title: "Tickets by category",
    columns: [
      { key: "category", label: "Category" },
      { key: "tickets", label: "Tickets" },
      { key: "share", label: "Share" },
      { key: "avg_csat", label: "Avg CSAT" },
    ],
    rows,
  };
}

export function tierTable(ds: Dataset): SummaryTable {
  const rows = [...countBy(uniqueTickets(ds), "customer_tier")].map(([k, r]) => ({
    tier: k,
    tickets: String(r.length),
    rated: String(validCsat(r).length),
    avg_csat: fmt(avg(validCsat(r))),
  }));
  return {
    title: "CSAT by customer tier",
    columns: [
      { key: "tier", label: "Tier" },
      { key: "tickets", label: "Tickets" },
      { key: "rated", label: "Tickets with CSAT" },
      { key: "avg_csat", label: "Avg CSAT" },
    ],
    rows,
  };
}

/** Weekly trend (weeks starting Monday), valid ISO dates only. */
export function weeklyTable(ds: Dataset, targets: SlaTargets): SummaryTable | null {
  const eligible = new Set(slaEligible(ds));
  const m = new Map<string, DatasetRow[]>();
  for (const r of uniqueTickets(ds)) {
    const d = s(r.created_date);
    if (!ISO.test(d)) continue;
    const date = new Date(`${d}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) continue;
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const k = date.toISOString().slice(0, 10);
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  if (m.size < 2) return null;
  const rows = [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, r]) => {
      const el = r.filter((x) => eligible.has(x));
      return {
        week: k,
        tickets: String(r.length),
        avg_first_response: fmt(avg(validFrt(r))),
        sla_breach: el.length ? `${round1((el.filter((x) => breached(x, targets)).length / el.length) * 100)}%` : "—",
        avg_csat: fmt(avg(validCsat(r))),
      };
    });
  return {
    title: "Weekly trend",
    columns: [
      { key: "week", label: "Week starting" },
      { key: "tickets", label: "Tickets" },
      { key: "avg_first_response", label: "Avg first response (mins)" },
      { key: "sla_breach", label: "SLA breach rate" },
      { key: "avg_csat", label: "Avg CSAT" },
    ],
    rows,
  };
}

/** Throws when the generated export can't support a fair assessment, so generation retries. */
export function assertUsableTicketData(ds: Dataset) {
  const unique = uniqueTickets(ds);
  if (unique.length < 16) throw new Error("Ticket export too small.");
  if (duplicateTickets(ds) < 1) throw new Error("Ticket export has no duplicates.");
  if (missingPriority(ds) < 1) throw new Error("Ticket export has no missing priorities.");
  if (impossibleTimes(ds) < 1) throw new Error("Ticket export has no impossible times.");
  const urgent = urgentOrder(ds).length;
  if (urgent < 2 || urgent > 6) throw new Error("Ticket export needs 2-6 open urgent tickets.");
  if (topCategories(ds).length < 1 || slowestChannels(ds).length < 1) throw new Error("Ticket export lacks categories or channels.");
}
