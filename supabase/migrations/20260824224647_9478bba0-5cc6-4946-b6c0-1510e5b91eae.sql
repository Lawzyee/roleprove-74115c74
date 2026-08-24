ALTER TABLE public.attempt_task_results
  ADD COLUMN IF NOT EXISTS criteria_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pillar text;

ALTER TABLE public.simulation_attempts
  ADD COLUMN IF NOT EXISTS pillar_scores jsonb NOT NULL DEFAULT '{}'::jsonb;