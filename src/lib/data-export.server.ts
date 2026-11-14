import type { SupabaseClient } from '@supabase/supabase-js';
import { strToU8, zipSync } from 'fflate';
import { listUserBucketFiles } from './account-deletion.server';

/** Recordings larger than this are given as a 1-hour link instead of inside the zip. */
export const INLINE_RECORDING_LIMIT = 25 * 1024 * 1024;
export const LINK_SECONDS = 3600;
export const EXPORT_BUCKET = 'data-exports';

/** Thrown when one part of the export cannot be gathered; the whole export stops. */
export class ExportSectionError extends Error {
  constructor(public section: string, cause: string) { super(`${section}: ${cause}`); }
}

type Row = Record<string, unknown>;
/** Staff-only columns never exported (see README "Not included"). */
const STAFF_ONLY: Record<string, string[]> = { support_tickets: ['tags', 'staff_last_read_at'] };

export function toCsv(rows: Row[]): string {
  if (!rows.length) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

const strip = (table: string, rows: Row[]) => rows.map((r) => {
  const out = { ...r };
  for (const c of STAFF_ONLY[table] ?? []) delete out[c];
  return out;
});

/** Each data section: label used in errors and README, file stem, how to load. */
type Ctx = { admin: SupabaseClient; userId: string; ids: Record<string, string[]> };
const by = (table: string, column: string, key?: string) => async ({ admin, userId, ids }: Ctx) => {
  const values = key ? ids[key] ?? [] : [userId];
  if (!values.length) return [];
  const { data, error } = await admin.from(table).select('*').in(column, values);
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
};

export const SECTIONS: Array<{ label: string; file: string; about: string; load: (c: Ctx) => Promise<Row[]>; keep?: string }> = [
  { label: 'profile', file: 'profile', about: 'Your profile: name, email, headline, links, target role and settings.', load: by('profiles', 'id') },
  { label: 'legal acceptances', file: 'legal_acceptances', about: 'When you accepted each version of the Terms and Privacy Policy.', load: by('legal_acceptances', 'user_id') },
  { label: 'subscription status', file: 'subscriptions', about: 'Your Practice/Prep subscription records (status, period end, cancellation).', load: by('subscriptions', 'user_id') },
  { label: 'usage records', file: 'billing_usage', about: 'Each simulation or interview prep you started, used for free-allowance counting.', load: by('billing_usage', 'user_id') },
  { label: 'credentials', file: 'credentials', about: 'Certificates and qualifications you added. Uploaded certificate files are in files/credentials/.', load: by('credentials', 'user_id') },
  { label: 'pasted job ads', file: 'job_postings', about: 'Job descriptions you pasted, and what was extracted from them.', load: by('job_postings', 'user_id') },
  { label: 'simulation attempts', file: 'simulation_attempts', about: 'Every simulation you started, with scores and status.', load: by('simulation_attempts', 'user_id'), keep: 'attempts' },
  { label: 'personalised simulations', file: 'simulations', about: 'Simulations generated just for you (the scenarios behind your attempts).', load: by('simulations', 'owner_user_id'), keep: 'sims' },
  { label: 'personalised simulation questions', file: 'simulation_tasks', about: 'The questions in your personalised simulations, including the answer guides.', load: by('simulation_tasks', 'simulation_id', 'sims') },
  { label: 'simulation answers', file: 'attempt_answers', about: 'Your answers to each question, with score, feedback and criteria.', load: by('attempt_task_results', 'attempt_id', 'attempts') },
  { label: 'uploaded deliverables', file: 'deliverables', about: 'Files you uploaded in simulations, their extracted text and grades. The files are in files/deliverables/.', load: by('attempt_deliverables', 'user_id') },
  { label: 'deliverable grading records', file: 'deliverable_gradings', about: 'Each time an upload was graded (used for the regrade allowance).', load: by('deliverable_gradings', 'user_id') },
  { label: 'interview prep sessions', file: 'interview_prep_sessions', about: 'Your interview prep sessions, including the job ad and the text read from your CV. CV files are in files/deliverables/interview-prep-cv/.', load: by('interview_prep_sessions', 'user_id'), keep: 'sessions' },
  { label: 'interview prep questions', file: 'interview_prep_questions', about: 'Questions generated for your interview prep.', load: by('interview_prep_questions', 'session_id', 'sessions'), keep: 'questions' },
  { label: 'interview prep replies', file: 'interview_prep_replies', about: 'Your replies to interview prep questions, with feedback.', load: by('interview_prep_responses', 'question_id', 'questions') },
  { label: 'live interviews', file: 'live_interviews', about: 'Your live mock interviews, with the question plan and practice scorecard.', load: by('live_interviews', 'user_id'), keep: 'interviews' },
  { label: 'live interview transcripts', file: 'live_interview_messages', about: 'The full transcript of each live mock interview.', load: by('live_interview_messages', 'interview_id', 'interviews') },
  { label: 'support tickets', file: 'support_tickets', about: 'Your support tickets.', load: by('support_tickets', 'user_id'), keep: 'tickets' },
  { label: 'support messages', file: 'support_messages', about: 'Messages in your tickets, from you and from our support team.', load: by('support_messages', 'ticket_id', 'tickets'), keep: 'messages' },
  { label: 'support screenshots', file: 'support_attachments', about: 'Screenshots attached to support messages. The files are in files/support-attachments/.', load: by('support_attachments', 'message_id', 'messages') },
];

const FILE_BUCKETS: Array<{ bucket: string; label: string }> = [
  { bucket: 'credentials', label: 'certificate files' },
  { bucket: 'deliverables', label: 'uploaded files and CVs' },
  { bucket: 'attempt-recordings', label: 'recordings' },
  { bucket: 'support-attachments', label: 'support screenshot files' },
];

export const NOT_INCLUDED = [
  'Suspicious-content flags on uploads: notes for our support staff when an upload seemed to try to influence grading. They are staff review notes, not data you provided.',
  'Steering-attempt flags on live interviews: notes for our support staff when a message tried to change the interviewer\'s rules or the scoring. They are staff review notes, not interview content.',
  'Ticket tags and staff read times on support tickets: internal routing and workload markers for our support team.',
  'The scrambled email used to stop repeat free trials: it is a keyed one-way hash that cannot be turned back into your email or reliably linked to you.',
];

export type ExportResult = { zip: Uint8Array; links: Array<{ file: string; url: string; size: number }>; counts: Record<string, number> };

export async function buildExport(admin: SupabaseClient, userId: string, account: { email: string | null; createdAt: string }): Promise<ExportResult> {
  const entries: Record<string, Uint8Array> = {};
  const ctx: Ctx = { admin, userId, ids: {} };
  const data: Record<string, Row[]> = {};
  const counts: Record<string, number> = {};
  for (const s of SECTIONS) {
    let rows: Row[];
    try { rows = strip(s.file, await s.load(ctx)); }
    catch (e) { throw new ExportSectionError(s.label, (e as Error).message); }
    if (s.keep) ctx.ids[s.keep] = rows.map((r) => String(r.id));
    data[s.file] = rows; counts[s.file] = rows.length;
    entries[`data/${s.file}.csv`] = strToU8(toCsv(rows));
  }
  const links: ExportResult['links'] = [];
  for (const { bucket, label } of FILE_BUCKETS) {
    try {
      const files = await listUserBucketFiles(admin, bucket, userId);
      counts[`files/${bucket}`] = files.length;
      for (const f of files) {
        const rel = `files/${bucket}/${f.path.slice(userId.length + 1)}`;
        if (bucket === 'attempt-recordings' && f.size > INLINE_RECORDING_LIMIT) {
          const { data: signed, error } = await admin.storage.from(bucket).createSignedUrl(f.path, LINK_SECONDS, { download: true });
          if (error || !signed) throw new Error(error?.message ?? 'no link');
          links.push({ file: rel, url: signed.signedUrl, size: f.size });
          continue;
        }
        const { data: blob, error } = await admin.storage.from(bucket).download(f.path);
        if (error || !blob) throw new Error(`${f.path.split('/').pop()}: ${error?.message ?? 'missing'}`);
        entries[rel] = new Uint8Array(await blob.arrayBuffer());
      }
    } catch (e) { throw new ExportSectionError(label, (e as Error).message); }
  }
  const exportedAt = new Date().toISOString();
  entries['data/all_data.json'] = strToU8(JSON.stringify({ exported_at: exportedAt, account: { user_id: userId, email: account.email, created_at: account.createdAt }, ...data }, null, 2));
  if (links.length) entries['large_recordings_links.csv'] = strToU8(toCsv(links.map((l) => ({ file: l.file, size_bytes: l.size, download_link: l.url, link_expires: new Date(Date.now() + LINK_SECONDS * 1000).toISOString() }))));
  entries['README.txt'] = strToU8(readme(exportedAt, links.length > 0));
  return { zip: zipSync(entries, { level: 6 }), links, counts };
}

export function readme(exportedAt: string, hasLinks: boolean) {
  const lines = [
    'RoleProve — your data export',
    `Created: ${exportedAt}`,
    '',
    'data/all_data.json — everything below in one file, plus your account email and sign-up date.',
    'Each data/*.csv file holds one kind of record (one row per record; nested values are written as JSON):',
    ...SECTIONS.map((s) => `  data/${s.file}.csv — ${s.about}`),
    '',
    'files/ — the files you uploaded or that were recorded for you:',
    '  files/credentials/ — certificate files.',
    '  files/deliverables/ — files uploaded in simulations (by attempt) and CVs (interview-prep-cv/).',
    '  files/attempt-recordings/ — verified-attempt recordings.',
    '  files/support-attachments/ — screenshots attached to support messages.',
    ...(hasLinks ? ['', `large_recordings_links.csv — recordings too large to include. Each link downloads the file and stops working ${LINK_SECONDS / 60} minutes after the export was created.`] : []),
    '',
    'Not included, and why:',
    ...NOT_INCLUDED.map((n) => `  - ${n}`),
    '',
    'Questions? Contact support@roleprove.com',
  ];
  return lines.join('\n') + '\n';
}

/** Removes stored zips that were downloaded or are older than 24 hours. */
export async function purgeExpiredExports(admin: SupabaseClient) {
  const { data, error } = await admin.from('data_exports').select('id, file_path')
    .not('file_path', 'is', null).lt('expires_at', new Date().toISOString());
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const { error: rmErr } = await admin.storage.from(EXPORT_BUCKET).remove([r.file_path as string]);
    if (rmErr) throw new Error(rmErr.message);
    await admin.from('data_exports').update({ file_path: null, status: 'expired' }).eq('id', r.id).eq('status', 'ready');
    await admin.from('data_exports').update({ file_path: null }).eq('id', r.id);
  }
  return (data ?? []).length;
}
