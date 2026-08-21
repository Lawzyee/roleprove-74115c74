/**
 * Deterministic aggregations computed in code from the Stage 1 dataset.
 *
 * Stages 3 (commercial interpretation) and 4 (segmentation) must never show
 * AI-invented numbers: every figure here is derived from the real generated
 * rows using the same cleaning rules as the Stage 1 answer key (exact duplicate
 * rows removed, negative/non-numeric amounts treated as invalid).
 */

export type DatasetRow = Record<string, string>;
export type DatasetColumn = { key: string; label: string };
export type Dataset = { name: string; columns: DatasetColumn[]; rows: DatasetRow[] };
export type SummaryTable = { title: string; columns: DatasetColumn[]; rows: DatasetRow[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const DMY = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/;
const YM = /^(\d{4})[\/.-](\d{1,2})$/;

const CANCELLED = /cancel|churn|refund|lapsed|inactive|expired|failed|closed|terminated|void/i;
const VALUE_HINT = /amount|revenue|value|price|total|spend|cost|fee|sales|charge|gbp|usd/i;
const STATUS_HINT = /status|state|outcome|result|stage|flag/i;
const SEGMENT_HINT = /tier|plan|segment|category|type|region|channel|membership|product|group|branch|store|source/i;

function isBlank(value: unknown) {
  const v = String(value ?? "").trim().toLowerCase();
  return !v || v === "(blank)" || v === "n/a" || v === "null" || v === "-";
}

function parseAmount(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || !/\d/.test(raw)) return NaN;
  const n = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function fingerprint(columns: DatasetColumn[], row: DatasetRow) {
  return columns.map((c) => String(row[c.key] ?? "").trim().toLowerCase()).join("|");
}

export function uniqueRows(dataset: Dataset): DatasetRow[] {
  const seen = new Set<string>();
  const out: DatasetRow[] = [];
  for (const row of dataset.rows) {
    const fp = fingerprint(dataset.columns, row);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(row);
  }
  return out;
}

/** Returns YYYY-MM for anything that parses as a date, otherwise null. */
function toMonth(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (ISO_DATE.test(raw)) return raw.slice(0, 7);
  const ym = YM.exec(raw);
  if (ym) return `${ym[1]}-${String(Number(ym[2])).padStart(2, "0")}`;
  const dmy = DMY.exec(raw);
  if (dmy) {
    const month = Number(dmy[2]);
    if (month >= 1 && month <= 12) return `${dmy[3]}-${String(month).padStart(2, "0")}`;
  }
  if (!/[a-z]/i.test(raw) && !/[\/.-]/.test(raw)) return null;
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

function ratio(rows: DatasetRow[], key: string, predicate: (v: string) => boolean) {
  const filled = rows.filter((r) => !isBlank(r[key]));
  if (!filled.length) return 0;
  return filled.filter((r) => predicate(String(r[key]).trim())).length / filled.length;
}

function findDateColumn(dataset: Dataset, rows: DatasetRow[]) {
  return (
    dataset.columns.find((c) => ratio(rows, c.key, (v) => toMonth(v) !== null) >= 0.6) ?? null
  );
}

function findNumericColumn(dataset: Dataset, rows: DatasetRow[], exclude: string[] = []) {
  const numeric = dataset.columns.filter(
    (c) =>
      !exclude.includes(c.key) &&
      !/\bid\b|_id$|^id$/i.test(c.key) &&
      toMonthColumnGuard(rows, c.key) &&
      ratio(rows, c.key, (v) => Number.isFinite(parseAmount(v))) >= 0.6,
  );
  return numeric.find((c) => VALUE_HINT.test(c.key) || VALUE_HINT.test(c.label)) ?? numeric[0] ?? null;
}

function toMonthColumnGuard(rows: DatasetRow[], key: string) {
  // A date column parses as numbers too — keep it out of the value column pool.
  return ratio(rows, key, (v) => toMonth(v) !== null) < 0.6;
}

function distinctValues(rows: DatasetRow[], key: string) {
  return new Set(rows.filter((r) => !isBlank(r[key])).map((r) => String(r[key]).trim().toLowerCase()));
}

function findStatusColumn(dataset: Dataset, rows: DatasetRow[]) {
  const candidates = dataset.columns.filter((c) => {
    const values = distinctValues(rows, c.key);
    return values.size >= 2 && values.size <= 6;
  });
  return (
    candidates.find((c) => [...distinctValues(rows, c.key)].some((v) => CANCELLED.test(v))) ??
    candidates.find((c) => STATUS_HINT.test(c.key) || STATUS_HINT.test(c.label)) ??
    null
  );
}

function findSegmentColumn(dataset: Dataset, rows: DatasetRow[], exclude: string[]) {
  const candidates = dataset.columns.filter((c) => {
    if (exclude.includes(c.key)) return false;
    if (/\bid\b|_id$|^id$/i.test(c.key)) return false;
    if (ratio(rows, c.key, (v) => toMonth(v) !== null) >= 0.4) return false;
    if (ratio(rows, c.key, (v) => Number.isFinite(parseAmount(v))) >= 0.6) return false;
    const values = distinctValues(rows, c.key);
    return values.size >= 2 && values.size <= 6 && values.size < rows.length;
  });
  return (
    candidates.find((c) => SEGMENT_HINT.test(c.key) || SEGMENT_HINT.test(c.label)) ?? candidates[0] ?? null
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function titleCase(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Real monthly trend, grouped from the actual rows of whichever dataset carries
 * a date column. Returns null when no dataset supports it.
 */
export function buildMonthlyTrendTable(datasets: Dataset[]): SummaryTable | null {
  let best: { dataset: Dataset; rows: DatasetRow[]; date: DatasetColumn } | null = null;
  for (const dataset of datasets) {
    const rows = uniqueRows(dataset);
    const date = findDateColumn(dataset, rows);
    if (!date) continue;
    if (!best || rows.length > best.rows.length) best = { dataset, rows, date };
  }
  if (!best) return null;

  const { dataset, rows, date } = best;
  const value = findNumericColumn(dataset, rows, [date.key]);
  const status = findStatusColumn(dataset, rows);

  const months = new Map<string, { records: number; cancelled: number; value: number; invalid: number }>();
  for (const row of rows) {
    const month = toMonth(row[date.key]);
    if (!month) continue;
    const bucket = months.get(month) ?? { records: 0, cancelled: 0, value: 0, invalid: 0 };
    bucket.records += 1;
    if (status && CANCELLED.test(String(row[status.key] ?? ""))) bucket.cancelled += 1;
    if (value) {
      const n = parseAmount(row[value.key]);
      if (Number.isFinite(n) && n >= 0) bucket.value += n;
      else bucket.invalid += 1;
    }
    months.set(month, bucket);
  }
  if (months.size < 2) return null;

  const columns: DatasetColumn[] = [
    { key: "month", label: "Month" },
    { key: "records", label: `${titleCase(dataset.name)} rows` },
  ];
  if (status) columns.push({ key: "cancelled", label: `${titleCase(status.key)} (cancelled/churned)` });
  if (value) columns.push({ key: "value", label: `Valid ${titleCase(value.key)} total` });

  const sorted = [...months.entries()].sort(([a], [b]) => a.localeCompare(b));
  const tableRows: DatasetRow[] = sorted.map(([month, b]) => {
    const row: DatasetRow = { month, records: String(b.records) };
    if (status) row["cancelled"] = String(b.cancelled);
    if (value) row["value"] = String(round2(b.value));
    return row;
  });

  return {
    title: `Monthly trend — computed from ${dataset.name} (duplicates removed, invalid values excluded)`,
    columns,
    rows: tableRows,
  };
}

/**
 * Real per-segment breakdown, grouped from the actual rows of whichever dataset
 * carries a suitable categorical column. Returns null when none does.
 */
export function buildSegmentTable(datasets: Dataset[]): SummaryTable | null {
  let best: { dataset: Dataset; rows: DatasetRow[]; segment: DatasetColumn; status: DatasetColumn | null } | null =
    null;

  for (const dataset of datasets) {
    const rows = uniqueRows(dataset);
    const status = findStatusColumn(dataset, rows);
    const date = findDateColumn(dataset, rows);
    const segment = findSegmentColumn(dataset, rows, [status?.key ?? "", date?.key ?? ""].filter(Boolean));
    if (!segment) continue;
    if (!best || rows.length > best.rows.length) best = { dataset, rows, segment, status };
  }
  if (!best) return null;

  const { dataset, rows, segment, status } = best;
  const value = findNumericColumn(dataset, rows, [segment.key]);

  const groups = new Map<string, { count: number; total: number; valued: number; cancelled: number }>();
  for (const row of rows) {
    if (isBlank(row[segment.key])) continue;
    const key = String(row[segment.key]).trim();
    const bucket = groups.get(key) ?? { count: 0, total: 0, valued: 0, cancelled: 0 };
    bucket.count += 1;
    if (value) {
      const n = parseAmount(row[value.key]);
      if (Number.isFinite(n) && n >= 0) {
        bucket.total += n;
        bucket.valued += 1;
      }
    }
    if (status && CANCELLED.test(String(row[status.key] ?? ""))) bucket.cancelled += 1;
    groups.set(key, bucket);
  }
  if (groups.size < 2) return null;

  const columns: DatasetColumn[] = [
    { key: "segment", label: titleCase(segment.key) },
    { key: "records", label: "Rows" },
  ];
  if (value) {
    columns.push({ key: "total_value", label: `Total valid ${titleCase(value.key)}` });
    columns.push({ key: "avg_value", label: `Average valid ${titleCase(value.key)}` });
  }
  if (status) columns.push({ key: "cancelled_rate", label: "Cancelled / churned rate" });

  const tableRows: DatasetRow[] = [...groups.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([name, b]) => {
      const row: DatasetRow = { segment: name, records: String(b.count) };
      if (value) {
        row["total_value"] = String(round2(b.total));
        row["avg_value"] = b.valued ? String(round2(b.total / b.valued)) : "n/a";
      }
      if (status) row["cancelled_rate"] = `${Math.round((b.cancelled / b.count) * 100)}%`;
      return row;
    });

  return {
    title: `Segment breakdown by ${titleCase(segment.key)} — computed from ${dataset.name}`,
    columns,
    rows: tableRows,
  };
}

export function summariseTable(table: SummaryTable) {
  return `${table.title}\ncolumns: ${table.columns.map((c) => `${c.key} (${c.label})`).join(", ")}\nrows: ${JSON.stringify(
    table.rows,
  )}`;
}
