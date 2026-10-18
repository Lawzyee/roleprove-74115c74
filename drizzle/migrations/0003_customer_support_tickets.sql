ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_support_staff boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.protect_support_staff_flag() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF TG_OP = 'INSERT' THEN NEW.is_support_staff = false;
    ELSIF NEW.is_support_staff IS DISTINCT FROM OLD.is_support_staff THEN RAISE EXCEPTION 'Support staff status cannot be changed from the app'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_support_staff_flag BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_support_staff_flag();

CREATE OR REPLACE FUNCTION public.is_support_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((SELECT is_support_staff FROM public.profiles WHERE id=_user_id), false)
$$;
REVOKE ALL ON FUNCTION public.is_support_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_support_staff(uuid) TO authenticated, service_role;

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('billing','scoring_dispute','technical','data_request','other')),
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','replied','resolved')),
  attempt_id uuid REFERENCES public.simulation_attempts(id) ON DELETE SET NULL,
  data_request text CHECK (data_request IN ('export','delete')),
  tags text[] NOT NULL DEFAULT '{}',
  user_last_read_at timestamptz NOT NULL DEFAULT now(),
  staff_last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tickets_read ON public.support_tickets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_support_staff(auth.uid()));
CREATE POLICY tickets_owner_delete ON public.support_tickets FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX support_tickets_user ON public.support_tickets(user_id, created_at DESC);
CREATE INDEX support_tickets_status ON public.support_tickets(status, category, updated_at DESC);

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('user','staff')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_read ON public.support_messages FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR public.is_support_staff(auth.uid()))));
CREATE INDEX support_messages_ticket ON public.support_messages(ticket_id, created_at);

CREATE TABLE public.support_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.support_messages(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_attachments TO authenticated;
GRANT ALL ON public.support_attachments TO service_role;
ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY attachments_read ON public.support_attachments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.support_messages m JOIN public.support_tickets t ON t.id = m.ticket_id WHERE m.id = message_id AND (t.user_id = auth.uid() OR public.is_support_staff(auth.uid()))));

CREATE POLICY support_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'support-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY support_files_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'support-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY support_files_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'support-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);