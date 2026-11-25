import { ARRANGEMENTS, EMPLOYMENT, applyLinkProblem } from './job-center';

/** Plain-text only: everything read from pages or CSV ends up as text in draft fields, never rendered as HTML. */
export const FETCH_MAX_BYTES = 1_000_000;
export const CSV_MAX_BYTES = 1_000_000;
export const CSV_MAX_ROWS = 50;
export const CSV_COLUMNS = ['title','company','company website','location','work arrangement','employment type','role','seniority','salary min','salary max','apply link','source note'] as const;
export const CSV_TEMPLATE = CSV_COLUMNS.join(',') + '\n' + 'Data Analyst,Acme Ltd,https://acme.example,"Lagos, Nigeria",remote,full-time,data_analyst,entry,,,https://acme.example/careers/data-analyst,Company careers page\n';

export function normalizeHost(host: string) { return host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''); }
/** True when the host is a listed domain or any subdomain of one. */
export function blockedHost(host: string, list: readonly string[]) {
  const h = normalizeHost(host);
  return list.some((d) => { const b = normalizeHost(d.trim()); return Boolean(b) && (h === b || h.endsWith('.' + b)); });
}
export function cleanBlockList(raw: string) {
  return [...new Set(raw.split(/[\s,]+/).map((d) => normalizeHost(d.replace(/^https?:\/\//i, '').split('/')[0] ?? '')).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))].slice(0, 200);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith('#x')) { const n = parseInt(k.slice(2), 16); return Number.isFinite(n) && n > 31 ? String.fromCodePoint(n) : ' '; }
    if (k.startsWith('#')) { const n = parseInt(k.slice(1), 10); return Number.isFinite(n) && n > 31 ? String.fromCodePoint(n) : ' '; }
    return ENTITIES[k] ?? m;
  });
}
/** Removes scripts, styles and every tag, then decodes entities. Output is plain text. */
export function htmlToText(html: string, max = 20000) {
  const t = html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, ' ');
  return decodeEntities(decodeEntities(t)).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

export type DraftFields = { title: string; company: string; company_website: string | null; city: string; country: string; arrangement: (typeof ARRANGEMENTS)[number]; employment: (typeof EMPLOYMENT)[number]; full_description: string; summary: string };

function arrangementOf(v: unknown, text = ''): (typeof ARRANGEMENTS)[number] {
  const s = `${typeof v === 'string' ? v : ''} ${text}`.toLowerCase();
  if (/telecommute|remote/.test(s)) return 'remote';
  if (/hybrid/.test(s)) return 'hybrid';
  return 'on-site';
}
function employmentOf(v: unknown): (typeof EMPLOYMENT)[number] {
  const s = (Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : '').toLowerCase().replace(/[_\s]+/g, '-');
  if (s.includes('part')) return 'part-time';
  if (s.includes('contract') || s.includes('temporary')) return 'contract';
  if (s.includes('intern')) return 'internship';
  if (s.includes('freelance') || s.includes('per-diem')) return 'freelance';
  return 'full-time';
}
const str = (v: unknown, max: number) => (typeof v === 'string' ? htmlToText(v, max) : '');
function findJobPosting(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) { for (const n of node) { const f = findJobPosting(n, depth + 1); if (f) return f; } return null; }
  const o = node as Record<string, unknown>; const t = o['@type'];
  if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) return o;
  return findJobPosting(o['@graph'], depth + 1);
}
function metaContent(html: string, key: string) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, 'i'); const tag = html.match(re)?.[0];
  return tag ? htmlToText(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '', 2000) : '';
}

/** Reads the standard job posting markup first, then falls back to the page title and description. */
export function parseJobPage(html: string): { fields: DraftFields; source: 'job_markup' | 'page_title' } {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown; try { data = JSON.parse(m[1] ?? ''); } catch { continue; }
    const j = findJobPosting(data); if (!j) continue;
    const org = j['hiringOrganization'] as Record<string, unknown> | undefined;
    const locRaw = j['jobLocation']; const loc = (Array.isArray(locRaw) ? locRaw[0] : locRaw) as Record<string, unknown> | undefined;
    const addr = (loc?.['address'] ?? {}) as Record<string, unknown>;
    const country = addr['addressCountry']; const description = str(j['description'], 20000);
    return { source: 'job_markup', fields: {
      title: str(j['title'], 180), company: str(org?.['name'], 180),
      company_website: typeof org?.['sameAs'] === 'string' && !applyLinkProblem(org['sameAs'] as string) ? (org['sameAs'] as string).slice(0, 2000) : null,
      city: str(addr['addressLocality'], 100), country: typeof country === 'string' ? str(country, 100) : str((country as Record<string, unknown> | undefined)?.['name'], 100),
      arrangement: arrangementOf(j['jobLocationType'], description.slice(0, 400)), employment: employmentOf(j['employmentType']),
      full_description: description, summary: description.slice(0, 600),
    } };
  }
  const title = htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '', 180) || metaContent(html, 'og:title').slice(0, 180);
  const desc = metaContent(html, 'description') || metaContent(html, 'og:description');
  const site = metaContent(html, 'og:site_name').slice(0, 180);
  return { source: 'page_title', fields: { title, company: site, company_website: null, city: '', country: '', arrangement: arrangementOf('', `${title} ${desc}`), employment: 'full-time', full_description: desc.slice(0, 20000), summary: desc.slice(0, 600) } };
}

/** RFC 4180-style CSV parser (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) { if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c; continue; }
    if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(field); field = ''; if (row.some((f) => f.trim())) rows.push(row); row = []; }
    else field += c;
  }
  row.push(field); if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

export type CsvDraft = DraftFields & { role_key: 'data_analyst' | 'customer_support' | 'other'; other_role: string; seniority: 'entry' | 'mid' | 'senior'; salary_min: number | null; salary_max: number | null; apply_url: string; source_note: string };
export type CsvRowResult = { line: number; errors: string[]; draft: CsvDraft | null };
const plain = (v: string | undefined, max: number) => (v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function readCsv(text: string): { error: string | null; rows: CsvRowResult[] } {
  if (new TextEncoder().encode(text).length > CSV_MAX_BYTES) return { error: 'The file is larger than 1 MB.', rows: [] };
  const all = parseCsv(text); const header = (all[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { error: `Missing columns: ${missing.join(', ')}. Use the template.`, rows: [] };
  const body = all.slice(1);
  if (!body.length) return { error: 'The file has no job rows.', rows: [] };
  if (body.length > CSV_MAX_ROWS) return { error: `Up to ${CSV_MAX_ROWS} rows per file.`, rows: [] };
  const col = (r: string[], name: (typeof CSV_COLUMNS)[number]) => r[header.indexOf(name)];
  const seen = new Set<string>();
  return { error: null, rows: body.map((r, i) => {
    const errors: string[] = [];
    const title = plain(col(r, 'title'), 180); const company = plain(col(r, 'company'), 180);
    if (!title) errors.push('Title is required.'); if (!company) errors.push('Company is required.');
    const apply_url = plain(col(r, 'apply link'), 2000);
    if (!apply_url) errors.push('Apply link is required.'); else if (applyLinkProblem(apply_url)) errors.push('Apply link must be a public HTTPS address.');
    else { const k = apply_url.toLowerCase(); if (seen.has(k)) errors.push('Same apply link appears twice in this file.'); seen.add(k); }
    const website = plain(col(r, 'company website'), 2000);
    if (website && applyLinkProblem(website)) errors.push('Company website must be a public HTTPS address.');
    const arrRaw = plain(col(r, 'work arrangement'), 20).toLowerCase().replace(/onsite|on site/, 'on-site');
    if (arrRaw && !(ARRANGEMENTS as readonly string[]).includes(arrRaw)) errors.push('Work arrangement must be remote, hybrid or on-site.');
    const empRaw = plain(col(r, 'employment type'), 20).toLowerCase().replace(/\s+/g, '-');
    if (empRaw && !(EMPLOYMENT as readonly string[]).includes(empRaw)) errors.push(`Employment type must be one of: ${EMPLOYMENT.join(', ')}.`);
    const senRaw = plain(col(r, 'seniority'), 20).toLowerCase();
    if (senRaw && !['entry', 'mid', 'senior'].includes(senRaw)) errors.push('Seniority must be entry, mid or senior.');
    const num = (v: string | undefined, label: string) => { const s = plain(v, 20).replace(/[,\s]/g, ''); if (!s) return null; const n = Number(s); if (!Number.isFinite(n) || n < 0) { errors.push(`${label} must be a positive number.`); return null; } return n; };
    const salary_min = num(col(r, 'salary min'), 'Salary min'); const salary_max = num(col(r, 'salary max'), 'Salary max');
    if (salary_min !== null && salary_max !== null && salary_max < salary_min) errors.push('Salary max must be at least salary min.');
    const roleRaw = plain(col(r, 'role'), 100); const roleKey = roleRaw.toLowerCase().replace(/[\s-]+/g, '_');
    const role_key = roleKey === 'data_analyst' || roleKey === 'customer_support' ? roleKey : 'other';
    const parts = plain(col(r, 'location'), 200).split(',').map((p) => p.trim()).filter(Boolean);
    const country = parts.length > 1 ? (parts.pop() ?? '') : ''; const city = parts.join(', ');
    if (errors.length) return { line: i + 2, errors, draft: null };
    return { line: i + 2, errors, draft: {
      title, company, company_website: website || null, city: city.slice(0, 100), country: country.slice(0, 100),
      arrangement: (arrRaw || 'on-site') as CsvDraft['arrangement'], employment: (empRaw || 'full-time') as CsvDraft['employment'],
      role_key, other_role: role_key === 'other' ? (roleRaw || 'To confirm') : '', seniority: (senRaw || 'entry') as CsvDraft['seniority'],
      salary_min, salary_max, apply_url, source_note: plain(col(r, 'source note'), 1000), full_description: '', summary: title,
    } };
  }) };
}
