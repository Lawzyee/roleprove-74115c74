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

- Proctoring recordings are composited client-side (screen + camera PiP + mic) and uploaded once on final submit to the private attempt-recordings bucket at {userId}/{attemptId}.webm — keeps storage paths user-scoped so RLS and data deletion can target a single folder.
- Billing uses authenticated server functions, embedded Stripe checkout through the shared gateway utility, and signature-verified canonical subscription reconciliation; this prevents client-side fulfillment and stale webhook grants.
- Generation access is atomically reserved in PostgreSQL before AI calls and committed only for successful resources; card-free trials retain email-hashed history independently of profile deletion.
- Launch controls are service-role-only app_settings values; the first enforcement timestamp is immutable so toggling cannot restart trials.
- Support tickets are read through RLS (owner or is_support_staff) but written only by authenticated server functions using the service role, so rate limits, file checks and sender identity cannot be bypassed; the staff flag is protected by a profiles trigger.
- App emails use the server-only managed email helper and React Email registry; do not add queues, cron, generic browser send endpoints, or unsubscribe pages because the platform handles delivery and opt-outs.
- Signup confirmation returns through the public auth confirmation route, which validates the session then clears it before sign-in; never use a protected destination or assume signup creates a signed-in session.
- Legal wording lives in src/content/legal/*.ts with a version string; sign-up acceptance is recorded by an auth.users trigger from signup metadata into legal_acceptances, and a version change prompts signed-in users to re-accept — keeps legal text editable without code changes.
- Live roles are declared once in src/lib/role-registry.ts (ids, card copy, JD keywords, interview focus); each role keeps its own generator (jd.server.ts for Data Analyst, support.server.ts for Customer Support) and all structured answers/tables are computed in code from generated rows — so adding a role never changes another role's content or scores.
- Uploaded deliverables are validated (real file type, size from app_settings) and graded only on the server after the attempt is submitted; measured cleaning facts come from code, AI criteria must cite evidence, and graded criteria are merged into the attempt roll-up — file text is untrusted data, fenced in the prompt, and steering attempts are flagged to support staff only.
- Account erasure lives in src/lib/account-deletion.server.ts (eraseAccount): Stripe in both modes, then every user bucket, then every user table, then the sign-in account, stopping at the first failure; new user-data tables or buckets must be added to its lists and to the integration test, or deletion silently misses them.
- Data export lives in src/lib/data-export.server.ts (SECTIONS + every user bucket); new user-data tables must be added there and to the export integration test, and staff-only columns go in STAFF_ONLY — otherwise exports silently miss or leak data.
- Repeat-trial blocking stores HMAC-SHA256 of the email MD5 keyed by private.app_keys (non-API schema) via public.billing_email_hash — the database computes it so signup triggers and RLS-path checks need no app secret.
- Public portfolios (/p/$slug) are read only through server functions in src/lib/portfolio.functions.ts that query portfolios WHERE is_public = true with an explicit column allow-list (portfolio.server.ts), so private, unpublished and unknown slugs share one not-found path; photos are served only via /api/public/portfolio-photo/$slug under the same check, and all portfolio writes are server-only.
