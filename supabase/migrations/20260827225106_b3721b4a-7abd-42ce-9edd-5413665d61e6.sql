ALTER TABLE public.simulation_attempts
  ADD COLUMN IF NOT EXISTS proctoring_mode text,
  ADD COLUMN IF NOT EXISTS recording_file_path text,
  ADD COLUMN IF NOT EXISTS recording_consent_given_at timestamptz;

ALTER TABLE public.simulation_attempts
  DROP CONSTRAINT IF EXISTS simulation_attempts_proctoring_mode_check;
ALTER TABLE public.simulation_attempts
  ADD CONSTRAINT simulation_attempts_proctoring_mode_check
  CHECK (proctoring_mode IS NULL OR proctoring_mode IN ('practice','verified'));