ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS max_interview_turns integer NOT NULL DEFAULT 30 CHECK (max_interview_turns > 0),
  ADD COLUMN IF NOT EXISTS daily_interviews integer NOT NULL DEFAULT 3 CHECK (daily_interviews >= 0),
  ADD COLUMN IF NOT EXISTS daily_interview_turns integer NOT NULL DEFAULT 60 CHECK (daily_interview_turns >= 0),
  ADD COLUMN IF NOT EXISTS interview_answer_chars integer NOT NULL DEFAULT 1500 CHECK (interview_answer_chars > 0);

CREATE TABLE public.live_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prep_session_id uuid REFERENCES public.interview_prep_sessions(id) ON DELETE CASCADE,
  role_key text,
  title text,
  length text NOT NULL DEFAULT 'short' CHECK (length IN ('short','standard')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','ended_early')),
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_index integer NOT NULL DEFAULT 0,
  followups_used integer NOT NULL DEFAULT 0,
  turn_count integer NOT NULL DEFAULT 0,
  scorecard jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT ON public.live_interviews TO authenticated;
GRANT ALL ON public.live_interviews TO service_role;
ALTER TABLE public.live_interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own interviews read" ON public.live_interviews
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX live_interviews_user_day ON public.live_interviews(user_id, created_at DESC);

CREATE TABLE public.live_interview_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.live_interviews(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('interviewer','candidate','system')),
  content text NOT NULL,
  msg_type text NOT NULL CHECK (msg_type IN ('main','follow_up','closing','answer','redirect','note')),
  pillar text,
  question_index integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.live_interview_messages TO authenticated;
GRANT ALL ON public.live_interview_messages TO service_role;
ALTER TABLE public.live_interview_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own interview messages read" ON public.live_interview_messages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.live_interviews i
    WHERE i.id = interview_id AND i.user_id = auth.uid()
  ));
CREATE INDEX live_interview_messages_interview ON public.live_interview_messages(interview_id, created_at);

CREATE TABLE public.live_interview_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.live_interviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reason text NOT NULL,
  excerpt text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.live_interview_flags TO authenticated;
GRANT ALL ON public.live_interview_flags TO service_role;
ALTER TABLE public.live_interview_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "support staff read interview flags" ON public.live_interview_flags
  FOR SELECT TO authenticated USING (public.is_support_staff(auth.uid()));