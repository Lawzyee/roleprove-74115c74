CREATE TABLE public.job_center_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, company text NOT NULL, company_website text,
 city text NOT NULL DEFAULT '', country text NOT NULL DEFAULT '', arrangement text NOT NULL CHECK(arrangement IN ('remote','hybrid','on-site')),
 employment text NOT NULL CHECK(employment IN ('full-time','part-time','contract','internship','freelance')),
 role_key text NOT NULL CHECK(role_key IN ('data_analyst','customer_support','other')), other_role text NOT NULL DEFAULT '',
 seniority text NOT NULL CHECK(seniority IN ('entry','mid','senior')), salary_currency text, salary_min numeric, salary_max numeric, salary_period text,
 summary text NOT NULL CHECK(length(summary)<=600), apply_url text NOT NULL, posted_date date NOT NULL DEFAULT current_date,
 expires_date date NOT NULL DEFAULT (current_date+30), status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','expired','hidden')),
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.job_center_jobs TO authenticated;
GRANT ALL ON public.job_center_jobs TO service_role;
ALTER TABLE public.job_center_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY jobs_staff ON public.job_center_jobs TO authenticated USING(public.is_support_staff(auth.uid())) WITH CHECK(public.is_support_staff(auth.uid()));
CREATE POLICY jobs_browse ON public.job_center_jobs FOR SELECT TO authenticated USING(status='published' AND expires_date>=current_date AND deleted_at IS NULL);
CREATE TABLE public.job_center_private (
 job_id uuid PRIMARY KEY REFERENCES public.job_center_jobs(id) ON DELETE CASCADE, practice_text text NOT NULL DEFAULT '', source_note text NOT NULL DEFAULT '', staff_notes text NOT NULL DEFAULT '',
 apply_clicks bigint NOT NULL DEFAULT 0, consecutive_failures integer NOT NULL DEFAULT 0, last_checked_at timestamptz, link_broken boolean NOT NULL DEFAULT false, check_started_at timestamptz
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.job_center_private TO authenticated;
GRANT ALL ON public.job_center_private TO service_role;
ALTER TABLE public.job_center_private ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_private_staff ON public.job_center_private TO authenticated USING(public.is_support_staff(auth.uid())) WITH CHECK(public.is_support_staff(auth.uid()));
CREATE TABLE public.job_tracker (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, job_id uuid NOT NULL REFERENCES public.job_center_jobs(id),
 status text NOT NULL DEFAULT 'saved' CHECK(status IN ('saved','applied','interviewing','offer','rejected','not_interested')), notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,job_id)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.job_tracker TO authenticated;
GRANT ALL ON public.job_tracker TO service_role;
ALTER TABLE public.job_tracker ENABLE ROW LEVEL SECURITY;
CREATE POLICY tracker_owner ON public.job_tracker TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY jobs_saved_read ON public.job_center_jobs FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.job_tracker t WHERE t.job_id=id AND t.user_id=auth.uid()));
CREATE TABLE public.job_preferences (
 user_id uuid PRIMARY KEY, roles text[] NOT NULL DEFAULT '{}', arrangements text[] NOT NULL DEFAULT '{}', employment_types text[] NOT NULL DEFAULT '{}', countries text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.job_preferences TO authenticated;
GRANT ALL ON public.job_preferences TO service_role;
ALTER TABLE public.job_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY preferences_owner ON public.job_preferences TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
ALTER TABLE public.support_tickets ADD COLUMN job_center_id uuid REFERENCES public.job_center_jobs(id);
ALTER TABLE public.simulation_attempts ADD COLUMN job_center_id uuid REFERENCES public.job_center_jobs(id);
COMMENT ON COLUMN public.job_center_jobs.deleted_at IS 'Staff deletion removes a listing from browsing while preserving minimal listing details for existing private trackers.';
CREATE INDEX jobs_listing ON public.job_center_jobs(status,posted_date DESC);
CREATE INDEX tracker_owner_job ON public.job_tracker(user_id,job_id);
CREATE OR REPLACE FUNCTION public.increment_job_apply(p_job uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.job_center_jobs WHERE id=p_job AND status='published' AND expires_date>=current_date AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Job unavailable'; END IF;
 UPDATE public.job_center_private SET apply_clicks=apply_clicks+1 WHERE job_id=p_job;
END $$;
REVOKE ALL ON FUNCTION public.increment_job_apply(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.increment_job_apply(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.report_job_center(p_job uuid,p_reason text,p_details text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ticket uuid; j public.job_center_jobs; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(uid::text));
 IF p_reason NOT IN ('looks like a scam','link broken or job closed','wrong information','other') OR length(p_details)>2000 THEN RAISE EXCEPTION 'Invalid report'; END IF;
 IF (SELECT count(*) FROM public.support_tickets WHERE user_id=uid AND job_center_id IS NOT NULL AND created_at>now()-interval '1 hour')>=5 THEN RAISE EXCEPTION 'Up to 5 job reports per hour'; END IF;
 SELECT * INTO j FROM public.job_center_jobs WHERE id=p_job AND deleted_at IS NULL AND (status='published' OR EXISTS(SELECT 1 FROM public.job_tracker WHERE user_id=uid AND job_id=p_job));
 IF j.id IS NULL THEN RAISE EXCEPTION 'Job unavailable'; END IF;
 INSERT INTO public.support_tickets(user_id,category,subject,job_center_id,tags) VALUES(uid,'other',left('Job report: '||j.title,120),p_job,ARRAY['job_report']) RETURNING id INTO ticket;
 INSERT INTO public.support_messages(ticket_id,sender,body) VALUES(ticket,'user','Job: '||j.title||' at '||j.company||E'\nJob ID: '||j.id||E'\nReason: '||p_reason||E'\n'||p_details);
 RETURN ticket;
END $$;
REVOKE ALL ON FUNCTION public.report_job_center(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_job_center(uuid,text,text) TO authenticated;