# Live mock interview (text chat)

- [ ] Migration 0010: live_interviews, live_interview_messages, live_interview_flags (staff-only), app_settings limits (max_interview_turns 30, daily_interviews 3, daily_interview_turns 60, interview_answer_chars 1500), RLS + grants
- [ ] src/lib/live-interview.ts — shared types/labels
- [ ] src/lib/live-interview.server.ts — plan generation, turn engine (code-controlled), steering/off-topic/distress handling, scorecard
- [ ] src/lib/live-interview.functions.ts — start (withUsage interview_prep), answer, skip, end
- [ ] UI: live card on interview-prep.index.tsx + interview-prep.live.$interviewId.tsx chat route
- [ ] Deletion: USER_TABLES += live_interviews; extend deletion test
- [ ] Export: SECTIONS += interviews/messages, NOT_INCLUDED += steering flags; extend export test
- [ ] Privacy policy: AI-provider transcript placeholder line
- [ ] Unit tests: plan distribution, follow-up cap, limits, steering detection
- [ ] Run full test suite + verify build
