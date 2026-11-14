ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS max_upload_mb integer NOT NULL DEFAULT 10 CHECK (max_upload_mb > 0),
  ADD COLUMN IF NOT EXISTS free_regrades integer NOT NULL DEFAULT 1 CHECK (free_regrades >= 0),
  ADD COLUMN IF NOT EXISTS daily_grading_cap integer NOT NULL DEFAULT 20 CHECK (daily_grading_cap >= 0);

ALTER TABLE public.attempt_deliverables
  ADD COLUMN IF NOT EXISTS grading_status text NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS file_size integer,
  ADD COLUMN IF NOT EXISTS criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extraction_preview jsonb,
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS grading_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS graded_at timestamptz;

UPDATE public.attempt_deliverables SET grading_status = 'legacy';

ALTER TABLE public.attempt_deliverables
  ADD CONSTRAINT attempt_deliverables_grading_status_check
  CHECK (grading_status IN ('legacy','submitted','grading','graded','unreadable'));

COMMENT ON COLUMN public.attempt_deliverables.status IS 'DEPRECATED: replaced by grading_status';

-- Grades are written only by the server; owners can read their own rows.
DROP POLICY IF EXISTS "own deliverables" ON public.attempt_deliverables;
REVOKE INSERT, UPDATE, DELETE ON public.attempt_deliverables FROM authenticated;
CREATE POLICY "own deliverables read" ON public.attempt_deliverables
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.deliverable_gradings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  attempt_id uuid NOT NULL REFERENCES public.simulation_attempts(id) ON DELETE CASCADE,
  task_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.deliverable_gradings TO authenticated;
GRANT ALL ON public.deliverable_gradings TO service_role;
ALTER TABLE public.deliverable_gradings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own gradings read" ON public.deliverable_gradings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX deliverable_gradings_user_day ON public.deliverable_gradings(user_id, created_at DESC);

CREATE TABLE public.deliverable_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id uuid NOT NULL REFERENCES public.attempt_deliverables(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES public.simulation_attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reason text NOT NULL,
  excerpt text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.deliverable_flags TO authenticated;
GRANT ALL ON public.deliverable_flags TO service_role;
ALTER TABLE public.deliverable_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "support staff read flags" ON public.deliverable_flags
  FOR SELECT TO authenticated USING (public.is_support_staff(auth.uid()));