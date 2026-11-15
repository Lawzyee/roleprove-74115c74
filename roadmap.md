# Live mock interview (text chat) — done

- [x] Migration 0010: live_interviews, live_interview_messages, live_interview_flags (staff-only), app_settings limits, RLS + grants
- [x] src/lib/live-interview.ts — shared types/labels
- [x] src/lib/live-interview.server.ts — plan generation, turn engine, steering/off-topic/distress, scorecard
- [x] src/lib/live-interview.functions.ts — start (withUsage interview_prep), answer, skip, end
- [x] UI: live card on interview-prep.index.tsx + interview-prep.live.$interviewId.tsx chat route
- [x] Deletion: USER_TABLES += live_interviews; deletion test extended
- [x] Export: SECTIONS += interviews/messages, NOT_INCLUDED += steering flags; export test extended
- [x] Privacy policy: AI-provider transcript placeholder line
- [x] Unit tests: plan distribution, follow-up cap, limits, steering detection (13 tests)
- [x] Full suite 66 tests pass; real browser run: start, follow-up, steering, off-topic, early-end scorecard

# Public portfolio (opt-in /p/$slug) — done

- [x] Migration 0011: portfolios, portfolio_projects, staff-only deliverable-style flags, portfolio-photos bucket, RLS + grants
- [x] src/lib/portfolio.ts (slug/text/url rules), portfolio.server.ts (public allow-list, one not-found path), portfolio.functions.ts, image-meta.ts (real type + metadata strip)
- [x] PhotoCropper (square crop, 512px), PublicView (folders, cards, sign-up banner/card, report link)
- [x] Routes: /portfolio tab, /portfolio/$projectId editor, /portfolio/preview/*, /p/$slug/*, /api/public/portfolio-photo/$slug
- [x] Deletion: portfolios, portfolio_projects, photo bucket; export: settings, projects, photo; Privacy/Terms placeholder lines
- [x] Unit tests 13; full suite 77 pass incl. deletion + export integration tests
- [x] Real browser run: photo upload + crop + save, two role folders (Customer Support + Data Analyst), project editor, publish, public page signed-in (no sign-up prompt, report link works) and signed-out (sign-up prompt shows); test state restored afterwards

## Portfolio follow-up — done
- [x] Signed-out report form (reason, details, email, honeypot, 5/hour per address) + staff list in support inbox
- [x] Share buttons, QR download, "Where to use your link" card
