ALTER TABLE public.app_settings
  ADD COLUMN candidate_daily_applications integer NOT NULL DEFAULT 10,
  ADD COLUMN application_opens_per_hour integer NOT NULL DEFAULT 60,
  ADD COLUMN application_retention_months integer NOT NULL DEFAULT 6;

ALTER TABLE public.job_center_jobs DROP CONSTRAINT IF EXISTS job_center_jobs_application_method_check;
ALTER TABLE public.job_center_jobs ADD CONSTRAINT job_center_jobs_application_method_check CHECK (application_method IN ('external_link','roleprove','both'));

DO $m$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('public.validate_employer_job()'::regprocedure);
  n := replace(d, $x$IF NEW.payload->>'application_method' IS DISTINCT FROM 'external_link' THEN RAISE EXCEPTION 'External applications only'; END IF;$x$,
    $x$IF COALESCE(NEW.payload->>'application_method','external_link') NOT IN ('external_link','roleprove','both') THEN RAISE EXCEPTION 'Invalid application method'; END IF;$x$);
  IF n = d THEN RAISE EXCEPTION 'validate_employer_job not patched'; END IF;
  EXECUTE n;
  d := pg_get_functiondef('public.project_employer_job()'::regprocedure);
  n := replace(d, $x$p->>'full_description','external_link',$x$, $x$p->>'full_description',COALESCE(p->>'application_method','external_link'),$x$);
  n := replace(n, $x$full_description=EXCLUDED.full_description,$x$, $x$full_description=EXCLUDED.full_description,application_method=EXCLUDED.application_method,$x$);
  IF n = d OR position('application_method=EXCLUDED' in n) = 0 THEN RAISE EXCEPTION 'project_employer_job not patched'; END IF;
  EXECUTE n;
END $m$;

CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  job_id uuid REFERENCES public.employer_jobs(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  snapshot_id uuid REFERENCES public.application_snapshots(id) ON DELETE SET NULL,
  consent_id uuid REFERENCES public.application_consents(id) ON DELETE SET NULL,
  job_title text NOT NULL,
  company_name text NOT NULL,
  cover_note text NOT NULL DEFAULT '' CHECK (length(cover_note) <= 1000),
  cv_copy_path text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','viewed','shortlisted','interview','not_progressed','withdrawn','job_closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  status_changed_at timestamptz,
  withdrawn_at timestamptz,
  job_ended_at timestamptz,
  purged_at timestamptz
);
CREATE UNIQUE INDEX job_applications_one_active ON public.job_applications(user_id, job_id) WHERE status <> 'withdrawn' AND user_id IS NOT NULL AND job_id IS NOT NULL;
CREATE INDEX job_applications_job ON public.job_applications(job_id, created_at DESC);
CREATE INDEX job_applications_user ON public.job_applications(user_id, created_at DESC);
GRANT SELECT (id, job_id, company_id, job_title, company_name, status, created_at, viewed_at, status_changed_at, withdrawn_at, job_ended_at) ON public.job_applications TO authenticated;
GRANT ALL ON public.job_applications TO service_role;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_applications_own ON public.job_applications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY job_applications_company ON public.job_applications FOR SELECT TO authenticated USING (
  company_id IS NOT NULL AND company_id = public.company_of(auth.uid())
  AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = job_applications.company_id AND c.status = 'approved' AND c.delete_after IS NULL));

CREATE TABLE public.application_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL,
  company_id uuid,
  member_id uuid,
  action text NOT NULL CHECK (action IN ('open','cv')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX application_access_log_member ON public.application_access_log(member_id, created_at);
GRANT SELECT ON public.application_access_log TO authenticated;
GRANT ALL ON public.application_access_log TO service_role;
ALTER TABLE public.application_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY application_access_log_staff ON public.application_access_log FOR SELECT TO authenticated USING (public.is_support_staff(auth.uid()));

ALTER TABLE public.notification_settings ADD COLUMN email_application_update boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.create_notification(p_user uuid, p_type text, p_title text, p_body text, p_link text, p_related_type text, p_related_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
    WHEN 'application_update' THEN COALESCE(s.email_application_update, false)
    ELSE false END;
  INSERT INTO public.notifications (user_id, type, title, body, link, related_type, related_id, email_pending)
  VALUES (p_user, p_type, left(p_title, 120), left(COALESCE(p_body, ''), 500), p_link, p_related_type, p_related_id, want)
  ON CONFLICT DO NOTHING RETURNING id INTO new_id;
  IF new_id IS NULL THEN RETURN jsonb_build_object('created', false, 'reason', 'duplicate'); END IF;
  RETURN jsonb_build_object('created', true, 'id', new_id, 'email', want);
END $function$;