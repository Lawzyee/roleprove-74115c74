CREATE POLICY "own recording read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attempt-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own recording insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attempt-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own recording update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'attempt-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own recording delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attempt-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);