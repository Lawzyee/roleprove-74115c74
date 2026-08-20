ALTER TABLE public.credentials
  ADD COLUMN IF NOT EXISTS credential_type TEXT NOT NULL DEFAULT 'certification',
  ADD COLUMN IF NOT EXISTS verification_url TEXT,
  ADD COLUMN IF NOT EXISTS file_path TEXT;

ALTER TABLE public.credentials DROP CONSTRAINT IF EXISTS credentials_credential_type_check;
ALTER TABLE public.credentials ADD CONSTRAINT credentials_credential_type_check
  CHECK (credential_type IN ('degree','certification','prior_role'));

UPDATE public.credentials SET status = 'self_reported' WHERE status IS NULL OR status NOT IN ('self_reported','pending_review','verified');
ALTER TABLE public.credentials DROP CONSTRAINT IF EXISTS credentials_status_check;
ALTER TABLE public.credentials ADD CONSTRAINT credentials_status_check
  CHECK (status IN ('self_reported','pending_review','verified'));
ALTER TABLE public.credentials ALTER COLUMN status SET DEFAULT 'self_reported';

DROP POLICY IF EXISTS "Users read own credential files" ON storage.objects;
CREATE POLICY "Users read own credential files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'credentials' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users upload own credential files" ON storage.objects;
CREATE POLICY "Users upload own credential files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'credentials' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own credential files" ON storage.objects;
CREATE POLICY "Users delete own credential files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'credentials' AND auth.uid()::text = (storage.foldername(name))[1]);