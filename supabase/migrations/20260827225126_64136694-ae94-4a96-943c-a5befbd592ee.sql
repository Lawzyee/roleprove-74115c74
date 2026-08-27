CREATE POLICY "Users read own attempt recordings"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attempt-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own attempt recordings"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attempt-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own attempt recordings"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'attempt-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own attempt recordings"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attempt-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);