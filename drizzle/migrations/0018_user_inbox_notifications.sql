CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('support_reply','support_status','job_unavailable','data_export_ready','account','employer_message','application_update')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 500),
  link text CHECK (link IS NULL OR (link ~ '^/[A-Za-z0-9/_?=&.%-]*$' AND link NOT LIKE '//%')),
  related_type text,
  related_id text,
  email_pending boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE UNIQUE INDEX notifications_once ON public.notifications (user_id, type, related_type, related_id) NULLS NOT DISTINCT;
CREATE INDEX notifications_user_created ON public.notifications (user_id, created_at DESC);
GRANT SELECT, DELETE ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_owner_select ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY notifications_owner_update ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY notifications_owner_delete ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.notification_settings (
  user_id uuid PRIMARY KEY,
  email_support_reply boolean NOT NULL DEFAULT true,
  email_support_status boolean NOT NULL DEFAULT false,
  email_job_unavailable boolean NOT NULL DEFAULT false,
  email_data_export_ready boolean NOT NULL DEFAULT false,
  email_account boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_settings_owner ON public.notification_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.app_settings
  ADD COLUMN notifications_per_hour integer NOT NULL DEFAULT 20,
  ADD COLUMN notification_read_retention_days integer NOT NULL DEFAULT 90,
  ADD COLUMN notification_retention_days integer NOT NULL DEFAULT 180;

CREATE OR REPLACE FUNCTION public.create_notification(p_user uuid, p_type text, p_title text, p_body text, p_link text, p_related_type text, p_related_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int; n int; s public.notification_settings; want boolean; new_id uuid;
BEGIN
  IF p_link IS NOT NULL AND (p_link !~ '^/[A-Za-z0-9/_?=&.%-]*$' OR p_link LIKE '//%') THEN
    RETURN jsonb_build_object('created', false, 'reason', 'bad_link');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('notify:' || p_user::text));
  SELECT COALESCE((SELECT notifications_per_hour FROM public.app_settings LIMIT 1), 20) INTO lim;
  SELECT count(*) INTO n FROM public.notifications WHERE user_id = p_user AND created_at > now() - interval '1 hour';
  IF n >= lim THEN RETURN jsonb_build_object('created', false, 'reason', 'rate_limited'); END IF;
  SELECT * INTO s FROM public.notification_settings WHERE user_id = p_user;
  want := CASE p_type
    WHEN 'support_reply' THEN COALESCE(s.email_support_reply, true)
    WHEN 'support_status' THEN COALESCE(s.email_support_status, false)
    WHEN 'job_unavailable' THEN COALESCE(s.email_job_unavailable, false)
    WHEN 'data_export_ready' THEN COALESCE(s.email_data_export_ready, false)
    WHEN 'account' THEN COALESCE(s.email_account, false)
    ELSE false END;
  INSERT INTO public.notifications (user_id, type, title, body, link, related_type, related_id, email_pending)
  VALUES (p_user, p_type, left(p_title, 120), left(COALESCE(p_body, ''), 500), p_link, p_related_type, p_related_id, want)
  ON CONFLICT DO NOTHING RETURNING id INTO new_id;
  IF new_id IS NULL THEN RETURN jsonb_build_object('created', false, 'reason', 'duplicate'); END IF;
  RETURN jsonb_build_object('created', true, 'id', new_id, 'email', want);
END $$;
REVOKE ALL ON FUNCTION public.create_notification(uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_job_unavailable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  FOR t IN SELECT user_id FROM public.job_tracker WHERE job_id = NEW.id AND status IN ('saved','applied') LOOP
    PERFORM public.create_notification(t.user_id, 'job_unavailable', 'A job you saved is no longer available',
      left(NEW.title || ' at ' || NEW.company || ' is no longer open in the Job center.', 500), '/jobs/tracker', 'job', NEW.id::text);
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_job_unavailable() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER job_unavailable_notify AFTER UPDATE OF status, deleted_at ON public.job_center_jobs
FOR EACH ROW WHEN (OLD.status = 'published' AND OLD.deleted_at IS NULL AND (NEW.status <> 'published' OR NEW.deleted_at IS NOT NULL))
EXECUTE FUNCTION public.notify_job_unavailable();