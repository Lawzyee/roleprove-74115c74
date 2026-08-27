ALTER TABLE public.interview_prep_sessions
  ADD COLUMN IF NOT EXISTS cv_file_path text,
  ADD COLUMN IF NOT EXISTS cv_extracted_text text;