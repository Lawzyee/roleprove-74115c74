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
