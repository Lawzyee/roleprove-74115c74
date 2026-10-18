# Subscription checkout
- [x] Create the Practice/Prep test product and checkout.
- [x] Persist subscriptions, launch switch, trial history and usage; enforce access before generation.
- [x] Add dashboard plan status, billing settings and subscribe screen.
- [x] Verify successful checkout, paid access readback, billing portal and seven access-rule tests.
- [ ] Exercise expired-trial limits and failed-payment lifecycle end to end; blocked by restricted test database write access, without changing the launch switch or the user's subscription.

# Customer support (replaces the AI support-chat request; brief says no AI bot)
- [x] Help page with config-driven FAQ and contact button.
- [x] Ticket tables, private screenshot storage, server validation and rate limit.
- [x] My tickets list/thread, reply, resolve/reopen, unread badge.
- [x] Score dispute link on results; data-request options and tags.
- [x] Staff flag and /admin/support with RLS and server checks.
- [x] Set up managed email infrastructure and server-only sending for the selected sender domain.
- [ ] Email notifications (new ticket to support, staff reply to user) — delivery waits on domain verification; support recipient address still needs confirmation.
- [x] Delete tickets and attachments in account deletion.
- [x] Verify ticket+screenshot creation, signed-out/forged/direct-write denial, non-staff blocked.
- [ ] Verify cross-account isolation, staff reply/dispute view and account deletion — blocked: needs a second test account and a staff-flagged account.

# Billing gap fixes
- [x] Delete-account cancels Stripe subscription immediately (no refund) and fully removes login, files and data.
- [x] 1-day renewal buffer for active subscriptions (database + tested rule).
- [x] Failed first payment no longer blocks retrying checkout.
- [x] Billing emails: subscription started, payment failed, cancellation confirmed (send once notify.roleprove.com verifies).
