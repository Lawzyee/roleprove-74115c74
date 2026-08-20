CREATE TABLE public.job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_text text NOT NULL,
  source_url text,
  extracted_role_type text,
  extracted_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  extracted_seniority text,
  extracted_responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  company_context text,
  matched boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_postings TO authenticated;
GRANT ALL ON public.job_postings TO service_role;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own job postings" ON public.job_postings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.simulation_attempts
  ADD COLUMN job_posting_id uuid REFERENCES public.job_postings(id) ON DELETE SET NULL,
  ADD COLUMN simulation_type text NOT NULL DEFAULT 'generic' CHECK (simulation_type IN ('generic','jd_matched'));

ALTER TABLE public.simulations
  ADD COLUMN is_personalized boolean NOT NULL DEFAULT false,
  ADD COLUMN owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN source_simulation_id uuid REFERENCES public.simulations(id) ON DELETE SET NULL;

CREATE INDEX idx_simulations_owner ON public.simulations(owner_user_id);
CREATE INDEX idx_job_postings_user ON public.job_postings(user_id);