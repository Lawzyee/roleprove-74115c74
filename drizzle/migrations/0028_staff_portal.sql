ALTER TABLE public.app_settings
 ADD COLUMN staff_audit_retention_months integer NOT NULL DEFAULT 24 CHECK (staff_audit_retention_months BETWEEN 1 AND 120),
 ADD COLUMN staff_fetch_per_hour integer NOT NULL DEFAULT 30 CHECK (staff_fetch_per_hour BETWEEN 1 AND 500),
 ADD COLUMN fetch_block_domains text[] NOT NULL DEFAULT ARRAY['linkedin.com','indeed.com','glassdoor.com','ziprecruiter.com','monster.com','simplyhired.com','careerbuilder.com','jobberman.com','myjobmag.com','wellfound.com','angel.co','reed.co.uk','totaljobs.com','seek.com.au','naukri.com','stepstone.de','dice.com','jooble.org','adzuna.com','google.com']::text[];

CREATE TABLE public.staff_audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid,
 job_id uuid,
 action text NOT NULL CHECK (char_length(action) <= 60),
 detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 300),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_audit_log_job ON public.staff_audit_log(job_id, created_at DESC);
CREATE INDEX staff_audit_log_created ON public.staff_audit_log(created_at);
GRANT SELECT ON public.staff_audit_log TO authenticated;
GRANT ALL ON public.staff_audit_log TO service_role;
ALTER TABLE public.staff_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_audit_read ON public.staff_audit_log FOR SELECT TO authenticated USING (public.is_support_staff(auth.uid()) AND NOT public.is_employer(auth.uid()));

-- Shared staff notice helper (content-free; no user or company content).
CREATE OR REPLACE FUNCTION public.notify_staff(p_dest text, p_related text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; r jsonb; BEGIN
 FOR p IN SELECT id FROM public.profiles WHERE is_support_staff LOOP
  r:=public.create_notification(p.id,'account','A new item is waiting for review','',p_dest,'staff_review',p_related);
  IF r->>'id' IS NOT NULL THEN UPDATE public.notifications SET email_pending=false WHERE id=(r->>'id')::uuid; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.notify_staff(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_staff(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.staff_item_notice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_TABLE_NAME='support_tickets' THEN PERFORM public.notify_staff('/admin/support','ticket:'||NEW.id::text);
 ELSIF TG_TABLE_NAME='portfolio_reports' THEN PERFORM public.notify_staff('/admin/support','portfolio_report:'||NEW.id::text);
 ELSIF TG_TABLE_NAME='job_center_private' THEN
  IF NEW.link_broken AND NOT COALESCE(OLD.link_broken,false) THEN PERFORM public.notify_staff('/admin/jobs','broken_link:'||NEW.job_id::text||':'||now()::text); END IF;
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER support_ticket_staff_notice AFTER INSERT ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.staff_item_notice();
CREATE TRIGGER portfolio_report_staff_notice AFTER INSERT ON public.portfolio_reports FOR EACH ROW EXECUTE FUNCTION public.staff_item_notice();
CREATE TRIGGER broken_link_staff_notice AFTER UPDATE OF link_broken ON public.job_center_private FOR EACH ROW EXECUTE FUNCTION public.staff_item_notice();

CREATE OR REPLACE FUNCTION public.require_staff() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT public.is_support_staff(auth.uid()) OR public.is_employer(auth.uid()) THEN RAISE EXCEPTION 'Staff only' USING ERRCODE='42501'; END IF; END $$;
REVOKE ALL ON FUNCTION public.require_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_staff() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staff_dashboard() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE res jsonb; BEGIN
 PERFORM public.require_staff();
 SELECT jsonb_build_object(
  'companies',(SELECT jsonb_build_object('count',count(*),'oldest',min(created_at)) FROM public.companies WHERE status='pending' AND delete_after IS NULL),
  'jobs',(SELECT jsonb_build_object('count',count(*),'oldest',min(updated_at)) FROM public.job_center_jobs WHERE status='pending_review' AND deleted_at IS NULL),
  'tickets',(SELECT jsonb_build_object('count',count(*),'oldest',min(created_at)) FROM public.support_tickets WHERE status<>'resolved'),
  'unreplied',(SELECT jsonb_build_object('count',count(*),'oldest',min(t.created_at)) FROM public.support_tickets t WHERE t.status<>'resolved' AND NOT EXISTS(SELECT 1 FROM public.support_messages m WHERE m.ticket_id=t.id AND m.sender='staff')),
  'disputes',(SELECT jsonb_build_object('count',count(*),'oldest',min(created_at)) FROM public.support_tickets WHERE status<>'resolved' AND category='scoring_dispute'),
  'data_requests',(SELECT jsonb_build_object('count',count(*),'oldest',min(created_at)) FROM public.support_tickets WHERE status<>'resolved' AND category='data_request'),
  'reports',(SELECT jsonb_build_object('count',(SELECT count(*) FROM public.portfolio_reports WHERE status='open')+(SELECT count(*) FROM public.support_tickets WHERE status<>'resolved' AND 'job_report'=ANY(tags)),
     'oldest',LEAST((SELECT min(created_at) FROM public.portfolio_reports WHERE status='open'),(SELECT min(created_at) FROM public.support_tickets WHERE status<>'resolved' AND 'job_report'=ANY(tags))))),
  'broken_links',(SELECT jsonb_build_object('count',count(*),'oldest',min(p.last_checked_at)) FROM public.job_center_private p JOIN public.job_center_jobs j ON j.id=p.job_id WHERE p.link_broken AND j.deleted_at IS NULL),
  'expiring',(SELECT jsonb_build_object('count',count(*),'oldest',min(expires_date)) FROM public.job_center_jobs WHERE status='published' AND deleted_at IS NULL AND expires_date BETWEEN current_date AND current_date+7),
  'waitlist',(SELECT jsonb_build_object('count',count(*),'oldest',min(confirmed_at)) FROM public.employer_waitlist WHERE confirmed_at IS NOT NULL)
 ) INTO res;
 RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.staff_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_dashboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_accounts() RETURNS TABLE(email text, since timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM public.require_staff();
 RETURN QUERY SELECT p.email, p.created_at FROM public.profiles p WHERE p.is_support_staff ORDER BY p.created_at;
END $$;
REVOKE ALL ON FUNCTION public.staff_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_accounts() TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_duplicate_links(p_urls text[]) RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE res text[]; BEGIN
 PERFORM public.require_staff();
 SELECT COALESCE(array_agg(u),'{}') INTO res FROM unnest(p_urls) u WHERE EXISTS(SELECT 1 FROM public.job_center_jobs j WHERE j.deleted_at IS NULL AND j.apply_url_hash=encode(sha256(convert_to(public.normalized_job_apply_url(u),'UTF8')),'hex'));
 RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.staff_duplicate_links(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_duplicate_links(text[]) TO authenticated;