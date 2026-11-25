// Server-only: Apply in RoleProve. Candidates apply with a frozen snapshot; employers read it only via readSnapshotForEmployer.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVE_STATUSES, CV_LINK_SECONDS, STATUS_LABELS, applyProblem, hourKey, retentionDue, statusChangeProblem, type ApplicationStatus } from './applications';
import { createSnapshot, loadSources, readSnapshotForEmployer, sanitizeSettings, withdrawSnapshot } from './application-profile.server';
import type { ProfileSettings, ShareView } from './application-profile';
import { postingAccess } from './employer-jobs.server';

/** Applicants are readable only by members of an approved company (suspension or deletion notice removes access at once). */
async function applicantAccess(db: A, userId: string) {
  const r = await postingAccess(db, userId);
  if (r.company.status !== 'approved' || r.company.delete_after) throw new Error('Applicants are available only while your company is approved.');
  return r;
}
import { notify } from './notifications.server';

type A = SupabaseClient;
export const CV_BUCKET = 'application-cvs';
const SRC_CV_BUCKET = 'deliverables';
/** Path rule for the private per-snapshot CV copy: {candidateId}/{snapshotId}/{fileName}. Under the user's folder so account erasure clears it. */
export const cvCopyPath = (userId: string, snapshotId: string, fileName: string) => `${userId}/${snapshotId}/${fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'cv'}`;
const APP_COLS = 'id,user_id,job_id,company_id,snapshot_id,job_title,company_name,cover_note,cv_copy_path,status,created_at,viewed_at,status_changed_at,withdrawn_at,job_ended_at,purged_at';
type AppRow = { id: string; user_id: string | null; job_id: string | null; company_id: string | null; snapshot_id: string | null; job_title: string; company_name: string; cover_note: string; cv_copy_path: string | null; status: ApplicationStatus; created_at: string; viewed_at: string | null; status_changed_at: string | null; withdrawn_at: string | null; job_ended_at: string | null; purged_at: string | null };
const fail = (e: { message: string } | null, msg: string) => { if (e) throw new Error(msg); };

export async function appSettings(a: A) {
  const { data, error } = await a.from('app_settings').select('candidate_daily_applications,application_opens_per_hour,application_retention_months').eq('id', true).single();
  if (error || !data) throw new Error('Settings unavailable.');
  return data;
}

async function loadJob(a: A, jobId: string) {
  const { data: job } = await a.from('employer_jobs').select('id,company_id,payload,status').eq('id', jobId).maybeSingle();
  if (!job) return { job: null, company: null };
  const { data: company } = await a.from('companies').select('id,name,status,delete_after').eq('id', job.company_id).maybeSingle();
  return { job, company };
}

/** What the apply screen needs: job, company, current defaults and choosable sources. */
export async function applyContext(a: A, userId: string, jobId: string) {
  const { job, company } = await loadJob(a, jobId);
  const p = (job?.payload ?? {}) as Record<string, string>;
  const problem = applyProblem(job ? { status: job.status, expires_date: p['expires_date'] ?? '', application_method: p['application_method'] } : null, company);
  const { data: existing } = await a.from('job_applications').select('id,status').eq('user_id', userId).eq('job_id', jobId).neq('status', 'withdrawn').maybeSingle();
  return { problem: existing ? 'You have already applied to this job.' : problem, jobTitle: p['title'] ?? '', companyName: company?.name ?? '', existingId: existing?.id ?? null };
}

async function removeCopy(a: A, path: string | null) {
  if (!path) return;
  const { error } = await a.storage.from(CV_BUCKET).remove([path]);
  if (error) throw new Error('Could not delete the CV copy.');
}

async function copyCv(a: A, userId: string, snapshotId: string, view: ShareView) {
  if (!view.cv?.filePath) return null;
  const dl = await a.storage.from(SRC_CV_BUCKET).download(view.cv.filePath);
  if (dl.error || !dl.data) throw new Error('Your CV file could not be found. Choose another or leave it out.');
  const path = cvCopyPath(userId, snapshotId, view.cv.fileName);
  const up = await a.storage.from(CV_BUCKET).upload(path, dl.data, { contentType: dl.data.type || 'application/octet-stream', upsert: true });
  if (up.error) throw new Error('Could not attach your CV.');
  return path;
}

/** Deletes a snapshot (consent cascades) and its CV copy; the candidate keeps a plain history row. */
async function purge(a: A, app: Pick<AppRow, 'id' | 'snapshot_id' | 'cv_copy_path' | 'status'>, endedAt?: string | null) {
  await removeCopy(a, app.cv_copy_path);
  const upd: Record<string, unknown> = { purged_at: new Date().toISOString(), snapshot_id: null, consent_id: null, cover_note: '', cv_copy_path: null };
  if (ACTIVE_STATUSES.includes(app.status)) { upd['status'] = 'job_closed'; upd['job_ended_at'] = endedAt ?? new Date().toISOString(); }
  const u = await a.from('job_applications').update(upd).eq('id', app.id); fail(u.error, 'Could not update the application.');
  if (app.snapshot_id) { const d = await a.from('application_snapshots').delete().eq('id', app.snapshot_id); fail(d.error, 'Could not delete the snapshot.'); }
}

export async function submitApplication(a: A, userId: string, input: { jobId: string; settings: ProfileSettings; coverNote: string; consent: boolean }) {
  if (!input.consent) throw new Error('Please tick the consent box to send your application.');
  const { job, company } = await loadJob(a, input.jobId);
  const p = (job?.payload ?? {}) as Record<string, string>;
  const problem = applyProblem(job ? { status: job.status, expires_date: p['expires_date'] ?? '', application_method: p['application_method'] } : null, company);
  if (problem) throw new Error(problem);
  const s = await appSettings(a);
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await a.from('job_applications').select('id', { head: true, count: 'exact' }).eq('user_id', userId).gte('created_at', since);
  if ((count ?? 0) >= s.candidate_daily_applications) throw new Error(`You can send up to ${s.candidate_daily_applications} applications a day. Please try again tomorrow.`);
  const { data: dup } = await a.from('job_applications').select('id').eq('user_id', userId).eq('job_id', input.jobId).neq('status', 'withdrawn').maybeSingle();
  if (dup) throw new Error('You have already applied to this job.');
  const settings = sanitizeSettings(input.settings, await loadSources(a, userId));
  const snap = await createSnapshot(a, userId, { employerRef: company!.id, jobId: input.jobId, settings });
  let cvPath: string | null = null;
  try {
    cvPath = await copyCv(a, userId, snap.snapshotId, snap.content);
    const ins = await a.from('job_applications').insert({ user_id: userId, job_id: input.jobId, company_id: company!.id, snapshot_id: snap.snapshotId, consent_id: snap.consentId, job_title: p['title'] ?? 'Job', company_name: company!.name, cover_note: input.coverNote.trim().slice(0, 1000), cv_copy_path: cvPath }).select('id').single();
    if (ins.error || !ins.data) throw new Error(ins.error?.code === '23505' ? 'You have already applied to this job.' : 'Could not send your application.');
    const members = await a.from('company_members').select('user_id').eq('company_id', company!.id);
    for (const m of members.data ?? []) await notify(a, { userId: m.user_id, type: 'application_update', title: 'New applications', body: `New applications for ${p['title'] ?? 'your job'}.`, link: `/employer/applicants/${input.jobId}`, relatedType: 'job_applications_new', relatedId: hourKey(input.jobId) });
    return { id: ins.data.id as string };
  } catch (e) {
    await removeCopy(a, cvPath).catch(() => {});
    await a.from('application_snapshots').delete().eq('id', snap.snapshotId);
    throw e;
  }
}

export async function listMine(a: A, userId: string) {
  const { data, error } = await a.from('job_applications').select('id,job_id,job_title,company_name,status,created_at,viewed_at,status_changed_at,withdrawn_at,job_ended_at,purged_at,snapshot_id,cover_note').eq('user_id', userId).order('created_at', { ascending: false });
  fail(error, 'Could not load your applications.');
  const snapIds = (data ?? []).map((r) => r.snapshot_id).filter(Boolean) as string[];
  const { data: snaps } = snapIds.length ? await a.from('application_snapshots').select('id,content').in('id', snapIds) : { data: [] };
  const byId = new Map((snaps ?? []).map((s) => [s.id, strip(s.content as ShareView)]));
  return (data ?? []).map(({ snapshot_id, ...r }) => ({ ...r, shared: snapshot_id ? (byId.get(snapshot_id) ?? null) : null }));
}

export async function withdrawApplication(a: A, userId: string, id: string) {
  const { data: app } = await a.from('job_applications').select(APP_COLS).eq('id', id).eq('user_id', userId).maybeSingle();
  if (!app) throw new Error('Application not found.');
  const r = app as AppRow;
  if (r.status === 'withdrawn') return { ok: true };
  if (r.snapshot_id) await withdrawSnapshot(a, userId, r.snapshot_id);
  await removeCopy(a, r.cv_copy_path);
  const u = await a.from('job_applications').update({ status: 'withdrawn', withdrawn_at: new Date().toISOString(), cover_note: '', cv_copy_path: null }).eq('id', id); fail(u.error, 'Could not withdraw.');
  return { ok: true };
}

/** Internal refs (storage paths, photo path, prep session) never leave the server. */
function strip(v: ShareView): ShareView {
  const out = { ...v } as ShareView; delete out.photoRef;
  if (v.cv) out.cv = { sessionId: '', fileName: v.cv.fileName, filePath: '' };
  return out;
}

async function employerApp(db: A, a: A, userId: string, id: string) {
  const { company, member } = await applicantAccess(db, userId);
  const { data } = await a.from('job_applications').select(APP_COLS).eq('id', id).maybeSingle();
  const app = data as AppRow | null;
  if (!app || app.company_id !== company.id) throw new Error('Application not found.');
  return { app, company, member };
}

/** Members of an approved company: newest first, only fields the candidate included. No score sort/filter exists. */
export async function listApplicants(db: A, a: A, userId: string, jobId: string) {
  const { company, member } = await applicantAccess(db, userId);
  const { data: job } = await a.from('employer_jobs').select('id,company_id,payload').eq('id', jobId).maybeSingle();
  if (!job || job.company_id !== company.id) throw new Error('Job not found.');
  const { data, error } = await a.from('job_applications').select('id,snapshot_id,status,created_at,viewed_at').eq('job_id', jobId).order('created_at', { ascending: false });
  fail(error, 'Could not load applicants.');
  const rows = [];
  for (const r of data ?? []) {
    const view = r.status === 'withdrawn' || !r.snapshot_id ? null : await readSnapshotForEmployer(a, r.snapshot_id);
    rows.push({ id: r.id, created_at: r.created_at, status: r.status as ApplicationStatus,
      name: view ? view.name : r.status === 'withdrawn' ? 'Withdrawn by candidate' : 'No longer available',
      target: view?.target ? { score: view.target.score, badge: view.target.basis === 'verified' ? 'Verified' : 'Practice', wording: view.target.wording } : null });
  }
  return { jobTitle: (job.payload as Record<string, string>)['title'] ?? '', canChange: member.role !== 'viewer', rows };
}

async function logAccess(a: A, appId: string, companyId: string, memberId: string, action: 'open' | 'cv') {
  const r = await a.from('application_access_log').insert({ application_id: appId, company_id: companyId, member_id: memberId, action }); fail(r.error, 'Could not record access.');
}
async function openLimit(a: A, userId: string) {
  const s = await appSettings(a);
  const { count } = await a.from('application_access_log').select('id', { head: true, count: 'exact' }).eq('member_id', userId).eq('action', 'open').gte('created_at', new Date(Date.now() - 3600000).toISOString());
  if ((count ?? 0) >= s.application_opens_per_hour) throw new Error('You have opened a lot of applications in the last hour. Please try again a little later.');
}

export async function openApplication(db: A, a: A, userId: string, id: string) {
  const { app, company, member } = await employerApp(db, a, userId, id);
  const base = { id: app.id, jobId: app.job_id, jobTitle: app.job_title, status: app.status, created_at: app.created_at, canChange: member.role !== 'viewer' };
  if (app.status === 'withdrawn') return { ...base, withdrawn: true as const, view: null, coverNote: '', photo: null, hasCv: false };
  const view = app.snapshot_id ? await readSnapshotForEmployer(a, app.snapshot_id) : null;
  if (!view) return { ...base, withdrawn: false as const, view: null, coverNote: '', photo: null, hasCv: false };
  await openLimit(a, userId);
  await logAccess(a, app.id, company.id, userId, 'open');
  if (app.status === 'submitted') {
    const now = new Date().toISOString();
    await a.from('job_applications').update({ status: 'viewed', viewed_at: now, status_changed_at: now }).eq('id', app.id).eq('status', 'submitted');
    base.status = 'viewed';
  }
  let photo: string | null = null;
  if (view.photoRef) photo = (await a.storage.from('portfolio-photos').createSignedUrl(view.photoRef, CV_LINK_SECONDS)).data?.signedUrl ?? null;
  return { ...base, withdrawn: false as const, view: strip(view), coverNote: app.cover_note, photo, hasCv: Boolean(view.cv && app.cv_copy_path) };
}

/** A fresh 5-minute signed link per view, only for an included CV copy, for the in-app viewer. */
export async function cvLink(db: A, a: A, userId: string, id: string) {
  const { app, company } = await employerApp(db, a, userId, id);
  if (app.status === 'withdrawn' || !app.cv_copy_path || !app.snapshot_id) throw new Error('No CV is available for this application.');
  const view = await readSnapshotForEmployer(a, app.snapshot_id);
  if (!view?.cv) throw new Error('No CV is available for this application.');
  await openLimit(a, userId);
  await logAccess(a, app.id, company.id, userId, 'cv');
  const { data, error } = await a.storage.from(CV_BUCKET).createSignedUrl(app.cv_copy_path, CV_LINK_SECONDS);
  if (error || !data) throw new Error('Could not open the CV.');
  return { url: data.signedUrl, fileName: view.cv.fileName, pdf: /\.pdf$/i.test(view.cv.fileName) };
}

export async function setApplicationStatus(db: A, a: A, userId: string, id: string, next: string) {
  const { app, member } = await employerApp(db, a, userId, id);
  const problem = statusChangeProblem(app.status, next, member.role);
  if (problem) throw new Error(problem);
  if (app.status === next) return { ok: true };
  const u = await a.from('job_applications').update({ status: next, status_changed_at: new Date().toISOString() }).eq('id', id).eq('status', app.status).select('id');
  if (u.error || !u.data?.length) throw new Error('This application changed. Reload and try again.');
  if (app.user_id) await notify(a, { userId: app.user_id, type: 'application_update', title: 'Update on your application', body: `${app.job_title} at ${app.company_name}: ${STATUS_LABELS[next as ApplicationStatus]}.`, link: '/applications', relatedType: 'job_application', relatedId: `${id}:${next}` });
  return { ok: true };
}

/** Account erasure: withdraw everything and anonymise, so employers only see "Withdrawn by candidate". Runs before files and rows are deleted. */
export async function eraseCandidateApplications(a: A, userId: string) {
  const { data, error } = await a.from('job_applications').select('id,cv_copy_path').eq('user_id', userId);
  fail(error, 'Could not load applications.');
  for (const r of data ?? []) await removeCopy(a, r.cv_copy_path);
  const now = new Date().toISOString();
  const w = await a.from('job_applications').update({ status: 'withdrawn', withdrawn_at: now }).eq('user_id', userId).neq('status', 'withdrawn'); fail(w.error, 'Could not withdraw applications.');
  const u = await a.from('job_applications').update({ user_id: null, snapshot_id: null, consent_id: null, cover_note: '', cv_copy_path: null }).eq('user_id', userId); fail(u.error, 'Could not anonymise applications.');
}

/** Company deletion: delete snapshots and CV copies for its jobs and tell candidates once. */
export async function retireCompanyApplications(a: A, companyId: string) {
  const { data, error } = await a.from('job_applications').select(APP_COLS).eq('company_id', companyId).is('purged_at', null);
  fail(error, 'Could not load applications.');
  for (const r of (data ?? []) as AppRow[]) {
    const wasActive = ACTIVE_STATUSES.includes(r.status);
    await purge(a, r);
    if (wasActive && r.user_id) await notify(a, { userId: r.user_id, type: 'application_update', title: 'An application has closed', body: `${r.job_title} at ${r.company_name} is no longer available. What you shared has been deleted.`, link: '/applications', relatedType: 'job_application', relatedId: `${r.id}:company_deleted` });
  }
  return (data ?? []).length;
}

/** Hourly: mark applications to ended jobs as "job closed", then delete snapshots and CV copies N months after the job ended. */
export async function cleanApplications(a: A, now = Date.now()) {
  const s = await appSettings(a);
  const { data, error } = await a.from('job_applications').select(`${APP_COLS},employer_jobs(status,terminal_at)`).is('purged_at', null).limit(2000);
  fail(error, 'Could not load applications.');
  let closed = 0, purged = 0;
  for (const raw of data ?? []) {
    const r = raw as unknown as AppRow & { employer_jobs: { status: string; terminal_at: string | null } | null };
    const ended = !r.job_id || !r.employer_jobs ? (r.job_ended_at ?? new Date(now).toISOString()) : ['closed', 'expired'].includes(r.employer_jobs.status) ? (r.employer_jobs.terminal_at ?? new Date(now).toISOString()) : null;
    if (!ended) continue;
    if (!r.job_ended_at) {
      const upd: Record<string, unknown> = { job_ended_at: ended };
      if (ACTIVE_STATUSES.includes(r.status)) { upd['status'] = 'job_closed'; closed++; }
      await a.from('job_applications').update(upd).eq('id', r.id);
      r.job_ended_at = ended;
    }
    if (retentionDue(r.job_ended_at, s.application_retention_months, now)) { await purge(a, r, r.job_ended_at); purged++; }
  }
  return { closed, purged };
}
