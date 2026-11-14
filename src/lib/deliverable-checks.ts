/**
 * Deterministic check for the Data Analyst cleaning upload: compares the
 * candidate's cleaned table against the exact dataset generated for their
 * attempt. Every number here is measured in code — the AI grader only receives
 * these facts as evidence and can never change them.
 */
export type CheckDataset = { name: string; columns: Array<{ key: string; label?: string }>; rows: Array<Record<string, unknown>> };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_LIKE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}\s+[a-z]{3,9}\s+\d{4}|[a-z]{3,9}\s+\d{1,2},?\s+\d{4})$/i;

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const normHeader = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
function isBlank(v: unknown) {
  const s = norm(v);
  return !s || s === "(blank)" || s === "n/a" || s === "null" || s === "-";
}
function parseAmount(v: unknown) {
  const raw = String(v ?? "").trim();
  if (!raw || !/\d/.test(raw)) return NaN;
  const n = Number(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export type CleaningReport = {
  matched: boolean;
  datasetName: string | null;
  headerMatch: { expected: number; found: number; missing: string[]; extra: string[] };
  rows: { original: number; uploaded: number; expectedClean: number };
  duplicates: { injected: number; fixed: number; remaining: number };
  invalidRows: { injected: number; fixed: number; remaining: number; columns: string[] };
  badDates: { injected: number; fixed: number; remaining: number; columns: string[] };
  validRows: { total: number; preserved: number; deleted: string[]; altered: string[] };
  structureOk: boolean;
};

function columnProfile(dataset: CheckDataset) {
  const dateCols: string[] = [];
  const numCols: string[] = [];
  for (const c of dataset.columns) {
    const values = dataset.rows.map((r) => r[c.key]).filter((v) => !isBlank(v));
    if (!values.length) continue;
    const dateish = values.filter((v) => DATE_LIKE.test(String(v).trim())).length;
    if (dateish / values.length >= 0.6 || /date|_at$|day/.test(c.key)) {
      if (dateish / values.length >= 0.5) { dateCols.push(c.key); continue; }
    }
    const numeric = values.filter((v) => Number.isFinite(parseAmount(v)) && !DATE_LIKE.test(String(v).trim())).length;
    // Id-like columns are excluded: a "negative id" is not a cleaning issue we inject.
    if (numeric / values.length >= 0.6 && !/(^|_)id$/.test(c.key)) numCols.push(c.key);
  }
  return { dateCols, numCols };
}

function rowIssues(row: Record<string, unknown>, dateCols: string[], numCols: string[]) {
  const badDate = dateCols.some((k) => !isBlank(row[k]) && !ISO_DATE.test(String(row[k]).trim()));
  const invalid = numCols.some((k) => !isBlank(row[k]) && (!Number.isFinite(parseAmount(row[k])) || parseAmount(row[k]) < 0));
  return { badDate, invalid };
}

/** Picks the generated table whose headers best match the uploaded headers. */
export function matchDataset(datasets: CheckDataset[], headers: string[]) {
  const up = new Set(headers.map(normHeader));
  let best: { dataset: CheckDataset; score: number } | null = null;
  for (const d of datasets) {
    const keys = d.columns.map((c) => normHeader(c.key));
    const labels = d.columns.map((c) => normHeader(c.label ?? ""));
    const hits = d.columns.filter((_, i) => up.has(keys[i]!) || (labels[i] && up.has(labels[i]!))).length;
    const score = hits / d.columns.length;
    if (!best || score > best.score) best = { dataset: d, score };
  }
  return best && best.score >= 0.5 ? best.dataset : null;
}

export function checkCleanedTable(datasets: CheckDataset[], headers: string[], uploadedRows: string[][]): CleaningReport {
  const dataset = matchDataset(datasets, headers);
  const empty: CleaningReport = {
    matched: false,
    datasetName: null,
    headerMatch: { expected: 0, found: 0, missing: [], extra: headers },
    rows: { original: 0, uploaded: uploadedRows.length, expectedClean: 0 },
    duplicates: { injected: 0, fixed: 0, remaining: 0 },
    invalidRows: { injected: 0, fixed: 0, remaining: 0, columns: [] },
    badDates: { injected: 0, fixed: 0, remaining: 0, columns: [] },
    validRows: { total: 0, preserved: 0, deleted: [], altered: [] },
    structureOk: false,
  };
  if (!dataset) return empty;

  // Map uploaded column positions onto dataset keys.
  const headerIdx = new Map(headers.map((h, i) => [normHeader(h), i]));
  const position = new Map<string, number>();
  for (const c of dataset.columns) {
    const i = headerIdx.get(normHeader(c.key)) ?? (c.label ? headerIdx.get(normHeader(c.label)) : undefined);
    if (i !== undefined) position.set(c.key, i);
  }
  const keys = dataset.columns.map((c) => c.key);
  const missing = keys.filter((k) => !position.has(k));
  const known = new Set([...position.values()]);
  const extra = headers.filter((_, i) => !known.has(i));

  const upload = uploadedRows.map((r) => Object.fromEntries(keys.map((k) => [k, position.has(k) ? r[position.get(k)!] ?? "" : ""])));
  const fp = (row: Record<string, unknown>) => keys.map((k) => norm(row[k])).join("\u0001");

  const { dateCols, numCols } = columnProfile(dataset);

  // Original dataset facts.
  const seen = new Set<string>();
  const unique: Array<Record<string, unknown>> = [];
  for (const r of dataset.rows) { const f = fp(r); if (!seen.has(f)) { seen.add(f); unique.push(r); } }
  const injectedDup = dataset.rows.length - unique.length;
  const issues = unique.map((r) => rowIssues(r, dateCols, numCols));
  const injectedBadDate = issues.filter((i) => i.badDate).length;
  const injectedInvalid = issues.filter((i) => i.invalid).length;
  const clean = unique.filter((r, i) => !issues[i]!.badDate && !issues[i]!.invalid && keys.every((k) => !isBlank(r[k])));

  // Uploaded facts.
  const upSeen = new Set<string>();
  let remainingDup = 0;
  for (const r of upload) { const f = fp(r); if (upSeen.has(f)) remainingDup++; else upSeen.add(f); }
  const upIssues = upload.map((r) => rowIssues(r, dateCols, numCols));
  const remainingBad = upIssues.filter((i) => i.badDate).length;
  const remainingInvalid = upIssues.filter((i) => i.invalid).length;

  // Valid rows: preserved when an identical row survives; altered when its key survives with changes.
  const keyCol = keys[0]!;
  const pool = new Map<string, number>();
  for (const r of upload) pool.set(fp(r), (pool.get(fp(r)) ?? 0) + 1);
  const upKeys = new Set(upload.map((r) => norm(r[keyCol])));
  const deleted: string[] = [];
  const altered: string[] = [];
  let preserved = 0;
  for (const r of clean) {
    const f = fp(r);
    const n = pool.get(f) ?? 0;
    if (n > 0) { pool.set(f, n - 1); preserved++; }
    else if (upKeys.has(norm(r[keyCol]))) altered.push(String(r[keyCol]));
    else deleted.push(String(r[keyCol]));
  }

  const structureOk = missing.length === 0 && upload.length >= clean.length && upload.length <= dataset.rows.length;

  return {
    matched: true,
    datasetName: dataset.name,
    headerMatch: { expected: keys.length, found: keys.length - missing.length, missing, extra },
    rows: { original: dataset.rows.length, uploaded: upload.length, expectedClean: clean.length },
    duplicates: { injected: injectedDup, fixed: Math.max(0, injectedDup - remainingDup), remaining: remainingDup },
    invalidRows: { injected: injectedInvalid, fixed: Math.max(0, injectedInvalid - remainingInvalid), remaining: remainingInvalid, columns: numCols },
    badDates: { injected: injectedBadDate, fixed: Math.max(0, injectedBadDate - remainingBad), remaining: remainingBad, columns: dateCols },
    validRows: { total: clean.length, preserved, deleted, altered },
    structureOk,
  };
}

/** Turns the measured report into scores: issues fixed, valid rows kept, sensible structure. */
export function scoreCleaningReport(r: CleaningReport) {
  if (!r.matched) return null;
  const injected = r.duplicates.injected + r.invalidRows.injected + r.badDates.injected;
  const fixed = r.duplicates.fixed + r.invalidRows.fixed + r.badDates.fixed;
  const lost = r.validRows.deleted.length + r.validRows.altered.length;
  return {
    issuesFixed: injected > 0 ? fixed / injected : null,
    rowsPreserved: r.validRows.total > 0 ? Math.max(0, 1 - lost / r.validRows.total) : null,
    structure: r.structureOk ? 1 : r.headerMatch.missing.length === 0 ? 0.5 : 0,
  };
}

export function describeCleaningReport(r: CleaningReport) {
  if (!r.matched) return "The uploaded columns didn't match any table from this case, so the cleaning could not be measured.";
  const lines = [
    `Matched table: ${r.datasetName}. Headers: ${r.headerMatch.found}/${r.headerMatch.expected} expected columns present${r.headerMatch.missing.length ? ` (missing: ${r.headerMatch.missing.join(", ")})` : ""}${r.headerMatch.extra.length ? `; extra columns: ${r.headerMatch.extra.join(", ")}` : ""}.`,
    `Rows: original ${r.rows.original}, uploaded ${r.rows.uploaded}, valid rows in the original ${r.rows.expectedClean}.`,
    `Duplicates: ${r.duplicates.fixed} of ${r.duplicates.injected} removed (${r.duplicates.remaining} remain).`,
    `Invalid number rows (${r.invalidRows.columns.join(", ") || "no numeric columns"}): ${r.invalidRows.fixed} of ${r.invalidRows.injected} fixed (${r.invalidRows.remaining} remain).`,
    `Inconsistent date formats (${r.badDates.columns.join(", ") || "no date columns"}): ${r.badDates.fixed} of ${r.badDates.injected} fixed (${r.badDates.remaining} remain).`,
    `Valid rows: ${r.validRows.preserved} of ${r.validRows.total} kept unchanged; ${r.validRows.deleted.length} wrongly deleted${r.validRows.deleted.length ? ` (${r.validRows.deleted.slice(0, 10).join(", ")})` : ""}; ${r.validRows.altered.length} altered${r.validRows.altered.length ? ` (${r.validRows.altered.slice(0, 10).join(", ")})` : ""}.`,
  ];
  return lines.join("\n");
}
