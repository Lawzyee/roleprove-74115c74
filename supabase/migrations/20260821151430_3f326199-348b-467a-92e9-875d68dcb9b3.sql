CREATE TABLE public.attempt_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.simulation_attempts(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.simulation_tasks(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review',
  feedback text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attempt_deliverables TO authenticated;
GRANT ALL ON public.attempt_deliverables TO service_role;

ALTER TABLE public.attempt_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own deliverables" ON public.attempt_deliverables
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own deliverable files read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'deliverables' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "own deliverable files insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'deliverables' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "own deliverable files delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'deliverables' AND auth.uid()::text = (storage.foldername(name))[1]);