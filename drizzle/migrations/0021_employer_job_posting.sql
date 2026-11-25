ALTER TABLE public.app_settings ADD COLUMN employer_job_review_count integer NOT NULL DEFAULT 3 CHECK (employer_job_review_count BETWEEN 1 AND 100), ADD COLUMN employer_active_jobs integer NOT NULL DEFAULT 10 CHECK (employer_active_jobs BETWEEN 1 AND 1000), ADD COLUMN employer_daily_jobs integer NOT NULL DEFAULT 5 CHECK (employer_daily_jobs BETWEEN 1 AND 1000), ADD COLUMN employer_job_retention_months integer NOT NULL DEFAULT 12 CHECK (employer_job_retention_months BETWEEN 1 AND 120);
ALTER TABLE public.companies ADD COLUMN review_every_posting boolean NOT NULL DEFAULT false, ADD COLUMN review_reset_at timestamptz;
ALTER TABLE public.job_center_jobs ADD COLUMN full_description text NOT NULL DEFAULT '', ADD COLUMN application_method text NOT NULL DEFAULT 'external_link' CHECK (application_method = 'external_link'), ADD COLUMN suggested_practice_role text CHECK (suggested_practice_role IN ('data_analyst','customer_support')), ADD COLUMN company_approved boolean NOT NULL DEFAULT false;
ALTER TABLE public.job_center_jobs DROP CONSTRAINT job_center_jobs_source_type_check;
ALTER TABLE public.job_center_jobs ADD CONSTRAINT job_center_jobs_source_type_check CHECK (source_type IN ('staff','company_board','employer_submitted','employer_account'));
CREATE TABLE public.employer_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 author_id uuid, payload jsonb NOT NULL DEFAULT '{}', practice_text text NOT NULL DEFAULT '' CHECK(length(practice_text)<=20000),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_review','published','paused','closed','expired')),
 flags text[] NOT NULL DEFAULT '{}', moderation_reason text NOT NULL DEFAULT '', approved_once boolean NOT NULL DEFAULT false, approved_at timestamptz,
 submitted_at timestamptz, terminal_at timestamptz, expiring_notice_date date, views bigint NOT NULL DEFAULT 0, apply_clicks bigint NOT NULL DEFAULT 0,
 version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.employer_jobs TO authenticated;
GRANT ALL ON public.employer_jobs TO service_role;
ALTER TABLE public.employer_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX employer_jobs_company_idx ON public.employer_jobs(company_id,status);
CREATE OR REPLACE FUNCTION public.can_post_company(p_user uuid,p_company uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_employer(p_user) AND EXISTS(SELECT 1 FROM public.company_members m JOIN public.companies c ON c.id=m.company_id WHERE m.user_id=p_user AND m.company_id=p_company AND m.role IN ('owner','recruiter') AND c.status='approved')
$$;
REVOKE ALL ON FUNCTION public.can_post_company(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_post_company(uuid,uuid) TO authenticated,service_role;
CREATE POLICY employer_jobs_read ON public.employer_jobs FOR SELECT TO authenticated USING(public.is_support_staff(auth.uid()) OR (public.is_employer(auth.uid()) AND company_id=public.company_of(auth.uid()) AND EXISTS(SELECT 1 FROM public.companies c WHERE c.id=company_id AND c.status='approved')));
CREATE TABLE public.employer_job_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,job_id uuid NOT NULL REFERENCES public.employer_jobs(id) ON DELETE CASCADE,actor_id uuid,action text NOT NULL,reason text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.employer_job_events TO authenticated;
GRANT ALL ON public.employer_job_events TO service_role;
ALTER TABLE public.employer_job_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY employer_job_events_staff ON public.employer_job_events FOR SELECT TO authenticated USING(public.is_support_staff(auth.uid()));
CREATE INDEX employer_job_events_company_date ON public.employer_job_events(company_id,created_at);
CREATE POLICY job_center_jobs_company_visibility ON public.job_center_jobs AS RESTRICTIVE FOR SELECT TO authenticated USING (source_type<>'employer_account' OR company_approved OR public.is_support_staff(auth.uid()) OR EXISTS(SELECT 1 FROM public.job_tracker t WHERE t.job_id=job_center_jobs.id AND t.user_id=auth.uid()));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['deliverable_flags','deliverable_gradings','live_interview_flags','job_center_private'] LOOP EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_employer(auth.uid())) WITH CHECK (NOT public.is_employer(auth.uid()))',t||'_not_employer',t); END LOOP; END $$;
CREATE OR REPLACE FUNCTION public.validate_employer_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.app_settings; c public.companies; exp date; active_count integer; submissions integer; BEGIN
 SELECT * INTO c FROM public.companies WHERE id=NEW.company_id FOR UPDATE;
 IF TG_OP='UPDATE' AND NEW.company_id<>OLD.company_id THEN RAISE EXCEPTION 'Jobs cannot move between companies'; END IF;
 SELECT * INTO s FROM public.app_settings LIMIT 1;
 IF jsonb_typeof(NEW.payload)<>'object' OR length(COALESCE(NEW.payload->>'title','')) NOT BETWEEN 1 AND 180 OR length(COALESCE(NEW.payload->>'summary','')) NOT BETWEEN 1 AND 600 OR length(COALESCE(NEW.payload->>'full_description','')) NOT BETWEEN 1 AND 6000 THEN RAISE EXCEPTION 'Invalid job text'; END IF;
 IF NEW.payload->>'application_method' IS DISTINCT FROM 'external_link' THEN RAISE EXCEPTION 'External applications only'; END IF;
 exp:=(NEW.payload->>'expires_date')::date;
 IF TG_OP='INSERT' OR NEW.payload->>'expires_date' IS DISTINCT FROM OLD.payload->>'expires_date' THEN
 IF exp<current_date OR exp>current_date+90 THEN RAISE EXCEPTION 'Expiry must be within 90 days'; END IF; END IF;
 IF NEW.status IN ('pending_review','published') AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.payload IS DISTINCT FROM OLD.payload) THEN
 IF c.status<>'approved' OR c.delete_after IS NOT NULL THEN RAISE EXCEPTION 'Approved company required'; END IF;
 SELECT count(*) INTO active_count FROM public.employer_jobs WHERE company_id=NEW.company_id AND id<>NEW.id AND status IN ('pending_review','published','paused') AND (payload->>'expires_date')::date>=current_date;
 IF active_count>=s.employer_active_jobs THEN RAISE EXCEPTION 'Company active job limit reached'; END IF;
 END IF;
 IF NEW.status IN ('pending_review','published') AND (TG_OP='INSERT' OR OLD.status IN ('draft','closed','expired')) THEN
 SELECT count(*) INTO submissions FROM public.employer_job_events WHERE company_id=NEW.company_id AND action='submitted' AND created_at>=date_trunc('day',now());
 IF submissions>=s.employer_daily_jobs THEN RAISE EXCEPTION 'Company daily submission limit reached'; END IF;
 NEW.submitted_at:=now(); END IF;
 IF NEW.status IN ('closed','expired') THEN NEW.practice_text:=''; NEW.terminal_at:=COALESCE(NEW.terminal_at,now()); ELSE NEW.terminal_at:=NULL; END IF;
 IF NEW.status='published' AND NOT NEW.approved_once THEN NEW.approved_once:=true; NEW.approved_at:=now(); END IF;
 IF TG_OP='INSERT' THEN NEW.version:=1; ELSE NEW.version:=OLD.version+1; END IF;
 NEW.updated_at:=now(); RETURN NEW; END $$;
CREATE TRIGGER employer_job_validate BEFORE INSERT OR UPDATE OF payload,status,company_id,practice_text ON public.employer_jobs FOR EACH ROW EXECUTE FUNCTION public.validate_employer_job();
CREATE OR REPLACE FUNCTION public.project_employer_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.companies; p jsonb; projected_status text; m record; notice text; BEGIN
 SELECT * INTO c FROM public.companies WHERE id=NEW.company_id; p:=NEW.payload;
 projected_status:=CASE WHEN NEW.status='published' AND c.status='approved' AND c.delete_after IS NULL AND (p->>'expires_date')::date>=current_date THEN 'published' WHEN NEW.status IN ('draft','pending_review','expired') THEN NEW.status ELSE 'hidden' END;
 INSERT INTO public.job_center_jobs(id,title,company,company_website,city,country,arrangement,employment,role_key,other_role,seniority,salary_currency,salary_min,salary_max,salary_period,summary,apply_url,posted_date,expires_date,status,source_type,full_description,application_method,suggested_practice_role,company_approved)
 VALUES(NEW.id,p->>'title',c.name,c.website,COALESCE(p->>'city',''),COALESCE(p->>'country',''),p->>'arrangement',p->>'employment',p->>'role_key',COALESCE(p->>'other_role',''),p->>'seniority',NULLIF(p->>'salary_currency',''),NULLIF(p->>'salary_min','')::numeric,NULLIF(p->>'salary_max','')::numeric,NULLIF(p->>'salary_period',''),p->>'summary',p->>'apply_url',current_date,(p->>'expires_date')::date,projected_status,'employer_account',p->>'full_description','external_link',NULLIF(p->>'suggested_practice_role',''),c.status='approved' AND c.delete_after IS NULL)
 ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,company=EXCLUDED.company,company_website=EXCLUDED.company_website,city=EXCLUDED.city,country=EXCLUDED.country,arrangement=EXCLUDED.arrangement,employment=EXCLUDED.employment,role_key=EXCLUDED.role_key,other_role=EXCLUDED.other_role,seniority=EXCLUDED.seniority,salary_currency=EXCLUDED.salary_currency,salary_min=EXCLUDED.salary_min,salary_max=EXCLUDED.salary_max,salary_period=EXCLUDED.salary_period,summary=EXCLUDED.summary,apply_url=EXCLUDED.apply_url,expires_date=EXCLUDED.expires_date,status=EXCLUDED.status,full_description=EXCLUDED.full_description,suggested_practice_role=EXCLUDED.suggested_practice_role,company_approved=EXCLUDED.company_approved,deleted_at=NULL,updated_at=now();
 INSERT INTO public.job_center_private(job_id,practice_text) VALUES(NEW.id,CASE WHEN NEW.status IN ('closed','expired') THEN '' ELSE NEW.practice_text END) ON CONFLICT(job_id) DO UPDATE SET practice_text=EXCLUDED.practice_text;
 IF NEW.submitted_at IS NOT NULL AND (TG_OP='INSERT' OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at) THEN INSERT INTO public.employer_job_events(company_id,job_id,actor_id,action) VALUES(NEW.company_id,NEW.id,NEW.author_id,'submitted'); END IF;
 IF TG_OP='UPDATE' THEN
 notice:=CASE WHEN OLD.status='pending_review' AND NEW.status='published' THEN 'Job approved' WHEN NEW.status='draft' AND NEW.moderation_reason<>'' THEN 'Job rejected' WHEN NEW.status='closed' AND NEW.moderation_reason<>'' THEN 'Job unpublished' WHEN NEW.status='expired' AND OLD.status<>'expired' THEN 'Job expired' ELSE NULL END;
 IF notice IS NOT NULL THEN FOR m IN SELECT user_id FROM public.company_members WHERE company_id=NEW.company_id LOOP PERFORM public.create_notification(m.user_id,'account',notice,left((p->>'title')||CASE WHEN NEW.moderation_reason<>'' THEN ': '||NEW.moderation_reason ELSE '' END,500),'/employer/jobs','employer_job',NEW.id::text||':'||NEW.version::text); END LOOP; END IF; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER employer_job_projection AFTER INSERT OR UPDATE OF payload,status,practice_text ON public.employer_jobs FOR EACH ROW EXECUTE FUNCTION public.project_employer_job();
CREATE OR REPLACE FUNCTION public.refresh_company_jobs() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE public.job_center_jobs j SET company=NEW.name,company_website=NEW.website,company_approved=(NEW.status='approved' AND NEW.delete_after IS NULL),status=CASE WHEN e.status='published' AND NEW.status='approved' AND NEW.delete_after IS NULL AND j.expires_date>=current_date THEN 'published' WHEN e.status='published' THEN 'hidden' ELSE j.status END,updated_at=now() FROM public.employer_jobs e WHERE e.company_id=NEW.id AND j.id=e.id;
 RETURN NEW; END $$;
CREATE TRIGGER company_jobs_visibility AFTER UPDATE OF status,delete_after,name,website ON public.companies FOR EACH ROW EXECUTE FUNCTION public.refresh_company_jobs();
CREATE OR REPLACE FUNCTION public.retire_employer_projection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE public.job_center_jobs SET status='hidden',deleted_at=now(),full_description='',updated_at=now() WHERE id=OLD.id;
 DELETE FROM public.job_center_private WHERE job_id=OLD.id;
 IF NOT EXISTS(SELECT 1 FROM public.job_tracker WHERE job_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM public.simulation_attempts WHERE job_center_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM public.support_tickets WHERE job_center_id=OLD.id) AND NOT EXISTS(SELECT 1 FROM public.application_consents WHERE job_id=OLD.id) THEN DELETE FROM public.job_center_jobs WHERE id=OLD.id; END IF;
 RETURN OLD; END $$;
CREATE TRIGGER employer_job_retire BEFORE DELETE ON public.employer_jobs FOR EACH ROW EXECUTE FUNCTION public.retire_employer_projection();
CREATE OR REPLACE FUNCTION public.capture_employer_apply() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN UPDATE public.employer_jobs SET apply_clicks=apply_clicks+(NEW.apply_clicks-OLD.apply_clicks) WHERE id=NEW.job_id; RETURN NEW; END $$;
CREATE TRIGGER employer_apply_aggregate AFTER UPDATE OF apply_clicks ON public.job_center_private FOR EACH ROW WHEN(NEW.apply_clicks>OLD.apply_clicks) EXECUTE FUNCTION public.capture_employer_apply();
CREATE OR REPLACE FUNCTION public.record_job_view(p_job uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR public.is_employer(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.job_center_jobs WHERE id=p_job AND status='published' AND expires_date>=current_date AND deleted_at IS NULL AND (source_type<>'employer_account' OR company_approved)) THEN RAISE EXCEPTION 'Job unavailable'; END IF;
 UPDATE public.employer_jobs SET views=views+1 WHERE id=p_job; END $$;
REVOKE ALL ON FUNCTION public.record_job_view(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_job_view(uuid) TO authenticated;
DO $$ DECLARE f text; BEGIN FOREACH f IN ARRAY ARRAY['validate_employer_job','project_employer_job','refresh_company_jobs','retire_employer_projection','capture_employer_apply'] LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC,anon,authenticated',f); END LOOP; END $$;