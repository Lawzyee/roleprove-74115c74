ALTER TABLE public.app_settings ADD COLUMN public_jobs_enabled boolean NOT NULL DEFAULT true, ADD COLUMN public_jobs_indexable boolean NOT NULL DEFAULT false, ADD COLUMN staff_review_email_at timestamptz;
ALTER TABLE public.job_center_jobs ADD COLUMN public_page_enabled boolean NOT NULL DEFAULT true, ADD COLUMN ever_published boolean NOT NULL DEFAULT false;
UPDATE public.job_center_jobs j SET ever_published=true WHERE j.status='published' OR EXISTS(SELECT 1 FROM public.employer_jobs e WHERE e.id=j.id AND e.approved_once);
CREATE FUNCTION public.remember_job_publication() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.ever_published:=NEW.ever_published OR NEW.status='published' OR (TG_OP='UPDATE' AND OLD.ever_published); RETURN NEW; END $$;
CREATE TRIGGER job_publication_memory BEFORE INSERT OR UPDATE ON public.job_center_jobs FOR EACH ROW EXECUTE FUNCTION public.remember_job_publication();
CREATE FUNCTION public.public_job_rate(p_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended('public_job:'||p_hash,0));
IF (SELECT count(*) FROM public.employer_rate_hits WHERE kind='public_job' AND ip_hash=p_hash AND created_at>now()-interval '1 hour')>=120 THEN RETURN false; END IF;
INSERT INTO public.employer_rate_hits(kind,ip_hash) VALUES('public_job',p_hash); RETURN true; END $$;
REVOKE ALL ON FUNCTION public.public_job_rate(text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.public_job_rate(text) TO service_role;
CREATE FUNCTION public.read_public_job(p_job uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE j public.job_center_jobs; s public.app_settings; BEGIN
SELECT * INTO s FROM public.app_settings WHERE id=true;
IF NOT s.public_jobs_enabled THEN RETURN jsonb_build_object('state','not_found'); END IF;
SELECT * INTO j FROM public.job_center_jobs WHERE id=p_job AND ever_published AND public_page_enabled;
IF NOT FOUND OR j.status IN ('draft','pending_review','rejected') THEN RETURN jsonb_build_object('state','not_found'); END IF;
IF j.status<>'published' OR j.deleted_at IS NOT NULL OR j.expires_date<current_date OR (j.source_type='employer_account' AND NOT j.company_approved) THEN RETURN jsonb_build_object('state','unavailable'); END IF;
RETURN jsonb_build_object('state','published','indexable',s.public_jobs_indexable,'job',jsonb_build_object(
'id',j.id,'title',j.title,'company',j.company,'city',j.city,'country',j.country,'arrangement',j.arrangement,'employment',j.employment,'salary_currency',j.salary_currency,'salary_min',j.salary_min,'salary_max',j.salary_max,'salary_period',j.salary_period,'summary',j.summary,'full_description',j.full_description,'apply_url',j.apply_url,'posted_date',j.posted_date,'expires_date',j.expires_date,'application_method',j.application_method,'company_approved',j.company_approved)); END $$;
REVOKE ALL ON FUNCTION public.read_public_job(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.read_public_job(uuid) TO anon,authenticated,service_role;
CREATE FUNCTION public.count_public_job(p_job uuid,p_apply boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r jsonb; BEGIN
r:=public.read_public_job(p_job); IF r->>'state'<>'published' THEN RETURN false; END IF;
IF p_apply THEN IF r->'job'->>'application_method'='roleprove' THEN RETURN false; END IF; UPDATE public.job_center_private SET apply_clicks=apply_clicks+1 WHERE job_id=p_job;
ELSE UPDATE public.employer_jobs SET views=views+1 WHERE id=p_job; END IF; RETURN true; END $$;
REVOKE ALL ON FUNCTION public.count_public_job(uuid,boolean) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.count_public_job(uuid,boolean) TO service_role;
CREATE FUNCTION public.claim_staff_review_email() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE claimed boolean; BEGIN
UPDATE public.app_settings SET staff_review_email_at=now() WHERE id=true AND (staff_review_email_at IS NULL OR staff_review_email_at<=now()-interval '1 hour') RETURNING true INTO claimed; RETURN COALESCE(claimed,false); END $$;
REVOKE ALL ON FUNCTION public.claim_staff_review_email() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.claim_staff_review_email() TO service_role;
CREATE FUNCTION public.staff_review_notice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p record; k text; dest text; r jsonb; BEGIN
k:=CASE WHEN TG_TABLE_NAME='companies' THEN 'company' ELSE 'job' END;
IF (k='company' AND NEW.status<>'pending') OR (k='job' AND NEW.status<>'pending_review') THEN RETURN NEW; END IF;
IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
dest:=CASE WHEN k='company' THEN '/admin/companies' ELSE '/admin/jobs' END;
FOR p IN SELECT id FROM public.profiles WHERE is_support_staff LOOP
r:=public.create_notification(p.id,'account','A new item is waiting for review','',dest,'staff_review',k||':'||NEW.id::text||':'||NEW.updated_at::text);
IF r->>'id' IS NOT NULL THEN UPDATE public.notifications SET email_pending=false WHERE id=(r->>'id')::uuid; END IF;
END LOOP; RETURN NEW; END $$;
CREATE TRIGGER company_staff_review AFTER INSERT OR UPDATE OF status ON public.companies FOR EACH ROW EXECUTE FUNCTION public.staff_review_notice();
CREATE TRIGGER job_staff_review AFTER INSERT OR UPDATE OF status ON public.job_center_jobs FOR EACH ROW EXECUTE FUNCTION public.staff_review_notice();