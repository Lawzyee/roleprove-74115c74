<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Proctoring recordings: composited client-side, uploaded once on submit to private attempt-recordings at {userId}/{attemptId}.webm — user-scoped paths for RLS and deletion.
- Billing: authenticated server functions, embedded Stripe checkout via the gateway utility, signature-verified canonical reconciliation — no client-side fulfilment or stale grants.
- Generation access is reserved atomically in PostgreSQL before AI calls and committed only on success; trial history is email-hashed and survives profile deletion.
- Launch controls are service-role-only app_settings; the first enforcement timestamp is immutable so toggling can't restart trials.
- Support tickets: read via RLS (owner or is_support_staff), written only by authenticated server functions with the service role; the staff flag is protected by a profiles trigger.
- App emails use the server-only managed helper and React Email registry; no queues, cron, browser send endpoints or unsubscribe pages — the platform handles them.
- Signup confirmation returns via the public auth confirm route, which validates then clears the session; never a protected destination, never assume signup signs in.
- Legal wording lives in src/content/legal/*.ts with versions; signup acceptance is recorded by an auth.users trigger into legal_acceptances; a version change prompts re-acceptance.
- Live roles are declared once in src/lib/role-registry.ts; each role has its own generator and structured answers are computed in code — adding a role never changes another.
- Deliverables: real type/size checks, server-only grading after submit, measured facts from code, AI criteria cite evidence; file text is fenced untrusted data and steering is flagged to staff.
- Account erasure (src/lib/account-deletion.server.ts eraseAccount): Stripe, buckets, user tables, then sign-in account, stopping at first failure; new user tables/buckets must join its lists and integration test.
- Data export (src/lib/data-export.server.ts): new user tables join SECTIONS and the export test; staff-only columns go in STAFF_ONLY.
- Repeat-trial blocking stores HMAC-SHA256 of the email MD5 keyed by private.app_keys via public.billing_email_hash — no app secret needed.
- Public portfolios (/p/$slug) are read only via portfolio.functions.ts with is_public = true and a column allow-list (one not-found path); photos via /api/public/portfolio-photo/$slug; writes server-only.
- Signed-out portfolio reports go to staff-only portfolio_reports via reportPortfolioPublicFn (hashed-IP rate limit, honeypot, key in private.app_keys, retention purged hourly).
- Job center: public fields and staff-only practice text in separate RLS tables; tracker/preferences owner-only; staff deletion tombstones listings. Source identity is unique per reference; triggers hash normalised apply links; submitter contacts stay staff-only.
- Job practice uses existing generators under withUsage with privateSource; staff text is never stored in owner-readable rows.
- Application link checks validate every redirect and pin TLS to a public resolved address; unsupported verification fails closed (DNS rebinding).
- Employer waitlist/submissions (src/lib/employer*.ts): no account, SHA-256 link tokens, submissions enter as pending_review with contacts in job_center_private, hourly retention — nothing auto-publishes.
- Inbox notifications only via notify() → public.create_notification (service-role-only, duplicate guard, hourly cap, email preference); job-closure notices from a DB trigger.
- Application sharing (src/lib/application-profile*.ts): employer views only from buildShareView; snapshots/consents owner-read, server-written, frozen by trigger; employer reads via readSnapshotForEmployer, in-app only.
- Absolute links are built only in src/lib/site-url.ts from config, never request host/headers; site-url.test.ts enforces it.
- Employer accounts: kind in account_types; route gate + requireCandidate + restrictive RLS separate them; status via audited staffAction — layered so one bypass isn't enough.
- Employer postings: employer_jobs is company-owned and server-written; atomic triggers project only public fields to candidate listings and practice to the private table, preserving candidate-table restrictions.
- Applications: job_applications rows are server-written; employers read snapshots only via applications.server (approved company re-checked, opens logged/rate-limited); CV copies live per snapshot in application-cvs/{userId}/; table grants are column-limited.
- Sign-in/sign-up: `/` and `/auth` render the shared AuthPanel; signed-in people route via homeFor() in src/lib/auth-entry.ts; candidates never send account_type and employers sign up only through employerSignUpFn — the database rule stays the only place account type is set.
