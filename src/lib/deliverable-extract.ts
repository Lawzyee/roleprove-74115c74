/**
 * Pure helpers for uploaded deliverables: real file-type checks, content
 * extraction and prompt-injection detection. Nothing here executes file
 * content — macros, scripts, links and embedded objects are never opened.
 */
import { unzipSync, strFromU8 } from "fflate";

export type FileKind = "csv" | "xlsx" | "pptx" | "pdf" | "docx" | "png" | "jpg";

export const MAX_SHEETS = 5;
export const MAX_ROWS = 2000;
export const MAX_COLS = 50;
const MAX_UNZIPPED_ENTRY = 25 * 1024 * 1024;

export function extensionOf(name: string) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1]! : "";
}

export function kindFromExtension(ext: string): FileKind | null {
  if (ext === "jpeg" || ext === "jpg") return "jpg";
  return (["csv", "xlsx", "pptx", "pdf", "docx", "png"] as const).find((k) => k === ext) ?? null;
}

function startsWith(bytes: Uint8Array, sig: number[]) {
  return sig.every((b, i) => bytes[i] === b);
}

function zipEntryNames(bytes: Uint8Array): string[] | null {
  try {
    const names: string[] = [];
    unzipSync(bytes, {
      filter: (f) => {
        names.push(f.name);
        return false;
      },
    });
    return names;
  } catch {
    return null;
  }
}

/** Checks the file's real content matches its extension. Returns a friendly reason when it doesn't. */
export function sniffFileType(bytes: Uint8Array, ext: string): { ok: true; kind: FileKind } | { ok: false; reason: string } {
  const kind = kindFromExtension(ext);
  if (!kind) return { ok: false, reason: `.${ext || "?"} files aren't accepted here.` };
  const mismatch = { ok: false as const, reason: `This file isn't a real .${ext} file, so we can't accept it. Please export it again and re-upload.` };
  if (startsWith(bytes, [0x4d, 0x5a])) return mismatch; // Windows executable
  switch (kind) {
    case "pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) ? { ok: true, kind } : mismatch;
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? { ok: true, kind } : mismatch;
    case "jpg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]) ? { ok: true, kind } : mismatch;
    case "xlsx":
    case "pptx":
    case "docx": {
      if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return mismatch;
      const names = zipEntryNames(bytes);
      const marker = { xlsx: "xl/workbook.xml", pptx: "ppt/presentation.xml", docx: "word/document.xml" }[kind];
      return names?.includes(marker) ? { ok: true, kind } : mismatch;
    }
    case "csv": {
      const head = bytes.subarray(0, 65536);
      if (head.includes(0)) return mismatch;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(head.length < bytes.length ? head.subarray(0, lastNewline(head)) : head);
      } catch {
        return mismatch;
      }
      return { ok: true, kind };
    }
  }
}

function lastNewline(b: Uint8Array) {
  const i = b.lastIndexOf(10);
  return i > 0 ? i : b.length;
}

export function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function xmlText(xml: string) {
  return decodeXml(
    xml
      .replace(/<a:br\/>|<w:br\/>|<\/a:p>|<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim(),
  );
}

function unzipOnly(bytes: Uint8Array, keep: (name: string) => boolean) {
  return unzipSync(bytes, { filter: (f) => keep(f.name) && f.originalSize <= MAX_UNZIPPED_ENTRY });
}

const byNumber = (a: string, b: string) => Number(a.match(/(\d+)\.xml/)?.[1] ?? 0) - Number(b.match(/(\d+)\.xml/)?.[1] ?? 0);

/* ---------------- CSV / XLSX ---------------- */

export type Sheet = { name: string; headers: string[]; rows: string[][]; totalRows: number; formulas: Array<{ cell: string; formula: string; value: string }> };

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > MAX_ROWS + 1) break;
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function csvToSheet(text: string, name = "CSV"): Sheet {
  const all = parseCsv(text);
  const headers = (all[0] ?? []).slice(0, MAX_COLS).map((h) => h.trim());
  const body = all.slice(1);
  return { name, headers, rows: body.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS)), totalRows: body.length, formulas: [] };
}

function colIndex(ref: string) {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function extractXlsx(bytes: Uint8Array): Sheet[] {
  const files = unzipOnly(bytes, (n) => n === "xl/workbook.xml" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const shared = files["xl/sharedStrings.xml"]
    ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        decodeXml([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
      )
    : [];
  const names = files["xl/workbook.xml"]
    ? [...strFromU8(files["xl/workbook.xml"]).matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => decodeXml(m[1]!))
    : [];
  const sheetFiles = Object.keys(files).filter((n) => n.startsWith("xl/worksheets/")).sort(byNumber).slice(0, MAX_SHEETS);
  return sheetFiles.map((file, i) => {
    const xml = strFromU8(files[file]!);
    const grid: string[][] = [];
    const formulas: Sheet["formulas"] = [];
    let totalRows = 0;
    for (const rowMatch of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      totalRows++;
      if (grid.length > MAX_ROWS) continue;
      const row: string[] = [];
      for (const c of rowMatch[1]!.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]!;
        const inner = c[2] ?? "";
        const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1] ?? "";
        const type = attrs.match(/t="([^"]+)"/)?.[1];
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = "";
        if (type === "s" && v !== undefined) value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = decodeXml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
        else if (v !== undefined) value = decodeXml(v);
        const f = inner.match(/<f[^>]*>([\s\S]*?)<\/f>/)?.[1];
        if (f && formulas.length < 200) formulas.push({ cell: ref, formula: decodeXml(f), value });
        const idx = ref ? colIndex(ref) : row.length;
        if (idx < MAX_COLS) row[idx] = value;
      }
      grid.push(Array.from(row, (v) => v ?? ""));
    }
    const headers = (grid[0] ?? []).map((h) => h.trim());
    return { name: names[i] ?? `Sheet${i + 1}`, headers, rows: grid.slice(1, MAX_ROWS + 1), totalRows: Math.max(0, totalRows - 1), formulas };
  });
}

export function sheetsToText(sheets: Sheet[]) {
  return sheets
    .map((s) => {
      const lines = [`Sheet "${s.name}" — ${s.totalRows} data rows × ${s.headers.length} columns`, `Row 1 (headers): ${s.headers.join(" | ")}`];
      s.rows.slice(0, 60).forEach((r, i) => lines.push(`Row ${i + 2}: ${r.join(" | ")}`));
      if (s.rows.length > 60) lines.push(`… ${s.totalRows - 60} more rows not shown`);
      if (s.formulas.length) {
        lines.push(`Formulas (${s.formulas.length}${s.formulas.length >= 200 ? "+" : ""}):`);
        s.formulas.slice(0, 40).forEach((f) => lines.push(`  ${f.cell}: =${f.formula} → ${f.value}`));
      } else lines.push("Formulas: none (all values are typed in)");
      return lines.join("\n");
    })
    .join("\n\n");
}

/* ---------------- PPTX / DOCX ---------------- */

export type Slide = { number: number; text: string; notes: string; hasImage: boolean; hasChart: boolean };

export function extractPptx(bytes: Uint8Array): Slide[] {
  const files = unzipOnly(bytes, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n) || /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(n) || /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n) || /^ppt\/notesSlides\/_rels\/notesSlide\d+\.xml\.rels$/.test(n));
  // Map notes to slides through the notes' relationship file.
  const notesBySlide = new Map<string, string>();
  for (const name of Object.keys(files).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))) {
    const rels = files[name.replace("notesSlides/", "notesSlides/_rels/") + ".rels"];
    const target = rels ? strFromU8(rels).match(/Target="\.\.\/slides\/(slide\d+\.xml)"/)?.[1] : undefined;
    if (target) notesBySlide.set(target, xmlText(strFromU8(files[name]!)).replace(/^\d+$/m, "").trim());
  }
  return Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort(byNumber)
    .map((name, i) => {
      const xml = strFromU8(files[name]!);
      const relsXml = files[name.replace("slides/", "slides/_rels/") + ".rels"];
      const rels = relsXml ? strFromU8(relsXml) : "";
      const base = name.split("/").pop()!;
      return {
        number: i + 1,
        text: xmlText(xml),
        notes: notesBySlide.get(base) ?? "",
        hasImage: /relationships\/image"/.test(rels) || xml.includes("<p:pic>"),
        hasChart: /relationships\/chart"/.test(rels) || xml.includes("drawingml/2006/chart"),
      };
    });
}

export function slidesToText(slides: Slide[]) {
  return slides
    .map((s) => [`Slide ${s.number}${s.hasChart ? " [contains chart]" : ""}${s.hasImage ? " [contains image]" : ""}:`, s.text || "(no text)", s.notes ? `Speaker notes: ${s.notes}` : ""].filter(Boolean).join("\n"))
    .join("\n\n");
}

export function extractDocx(bytes: Uint8Array): string {
  const files = unzipOnly(bytes, (n) => n === "word/document.xml");
  const xml = files["word/document.xml"];
  return xml ? xmlText(strFromU8(xml)) : "";
}

/* ---------------- Prompt injection ---------------- */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all|any|the|previous|prior|above)?\s*(rules|instructions|rubric|criteria|prompts?)/i,
  /disregard\s+(the\s+)?(rubric|rules|instructions|criteria)/i,
  /(give|award|assign|score)\s+(me\s+|this\s+|the\s+candidate\s+)?(full|maximum|max|perfect)\s+(marks|score|points)/i,
  /(give|award|score|rate)\s+(me\s+|this\s+)?(a\s+)?100\s*(%|percent|\/\s*100)/i,
  /\b(you\s+are\s+now|act\s+as|new\s+instructions|system\s+prompt)\b/i,
  /\b(dear|note\s+to\s+(the\s+)?)\s*(grader|ai|assistant|model|marker)\b/i,
];

/** Returns the matching excerpt when the text tries to steer the grader. */
export function detectInjection(text: string): string | null {
  for (const re of INJECTION_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const start = Math.max(0, m.index - 40);
      return text.slice(start, m.index + m[0].length + 40).replace(/\s+/g, " ").trim();
    }
  }
  return null;
}
