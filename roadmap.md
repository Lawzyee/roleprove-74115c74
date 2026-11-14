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
