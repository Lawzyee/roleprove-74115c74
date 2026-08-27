
CREATE TABLE public.interview_prep_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT,
  source_jd_text TEXT NOT NULL,
  source_url TEXT,
  extracted_role_context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_prep_sessions TO authenticated;
GRANT ALL ON public.interview_prep_sessions TO service_role;
ALTER TABLE public.interview_prep_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prep sessions" ON public.interview_prep_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.interview_prep_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.interview_prep_sessions(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  question_text TEXT NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prep_questions_session ON public.interview_prep_questions(session_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_prep_questions TO authenticated;
GRANT ALL ON public.interview_prep_questions TO service_role;
ALTER TABLE public.interview_prep_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prep questions" ON public.interview_prep_questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.interview_prep_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.interview_prep_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()));

CREATE TABLE public.interview_prep_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL UNIQUE REFERENCES public.interview_prep_questions(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL DEFAULT '',
  feedback_text TEXT,
  rubric_scores JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prep_responses_question ON public.interview_prep_responses(question_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_prep_responses TO authenticated;
GRANT ALL ON public.interview_prep_responses TO service_role;
ALTER TABLE public.interview_prep_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prep responses" ON public.interview_prep_responses FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.interview_prep_questions q
    JOIN public.interview_prep_sessions s ON s.id = q.session_id
    WHERE q.id = question_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.interview_prep_questions q
    JOIN public.interview_prep_sessions s ON s.id = q.session_id
    WHERE q.id = question_id AND s.user_id = auth.uid()));
