ALTER TABLE public.job_center_private ADD COLUMN page_views bigint NOT NULL DEFAULT 0 CHECK (page_views >= 0);
CREATE OR REPLACE FUNCTION public.count_public_job(p_job uuid,p_apply boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.job_center_jobs;
BEGIN
 SELECT * INTO j FROM public.job_center_jobs WHERE id=p_job;
 IF NOT FOUND OR NOT (SELECT public_jobs_enabled FROM public.app_settings WHERE id=true) OR NOT j.public_page_enabled OR j.status<>'published' OR j.deleted_at IS NOT NULL OR j.expires_date<current_date THEN RETURN false; END IF;
 IF j.source_type='employer_account' AND NOT EXISTS(SELECT 1 FROM public.employer_jobs e JOIN public.companies c ON c.id=e.company_id WHERE e.id=j.id AND c.status='approved') THEN RETURN false; END IF;
 IF p_apply THEN
  IF COALESCE(j.application_method,'external_link') NOT IN('external_link','both') OR j.apply_url='' THEN RETURN false; END IF;
  INSERT INTO public.job_center_private(job_id,apply_clicks) VALUES(p_job,1) ON CONFLICT(job_id) DO UPDATE SET apply_clicks=public.job_center_private.apply_clicks+1;
 ELSE
  INSERT INTO public.job_center_private(job_id,page_views) VALUES(p_job,1) ON CONFLICT(job_id) DO UPDATE SET page_views=public.job_center_private.page_views+1;
  UPDATE public.employer_jobs SET views=views+1 WHERE id=p_job;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.count_public_job(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.count_public_job(uuid,boolean) TO service_role;