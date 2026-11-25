ALTER POLICY employer_jobs_read ON public.employer_jobs USING(public.is_support_staff(auth.uid()) OR (public.is_employer(auth.uid()) AND company_id=public.company_of(auth.uid())));
CREATE OR REPLACE FUNCTION public.increment_job_apply(p_job uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR public.is_employer(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.job_center_jobs WHERE id=p_job AND status='published' AND expires_date>=current_date AND deleted_at IS NULL AND (source_type<>'employer_account' OR company_approved)) THEN RAISE EXCEPTION 'Job unavailable'; END IF;
 UPDATE public.job_center_private SET apply_clicks=apply_clicks+1 WHERE job_id=p_job;
END $$;
CREATE OR REPLACE FUNCTION public.report_job_center(p_job uuid,p_reason text,p_details text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ticket uuid; j public.job_center_jobs; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL OR public.is_employer(uid) THEN RAISE EXCEPTION 'Candidate sign in required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(uid::text));
 IF p_reason NOT IN ('looks like a scam','link broken or job closed','wrong information','other') OR length(p_details)>2000 THEN RAISE EXCEPTION 'Invalid report'; END IF;
 IF (SELECT count(*) FROM public.support_tickets WHERE user_id=uid AND job_center_id IS NOT NULL AND created_at>now()-interval '1 hour')>=5 THEN RAISE EXCEPTION 'Up to 5 job reports per hour'; END IF;
 SELECT * INTO j FROM public.job_center_jobs WHERE id=p_job AND deleted_at IS NULL AND ((status='published' AND expires_date>=current_date AND (source_type<>'employer_account' OR company_approved)) OR EXISTS(SELECT 1 FROM public.job_tracker WHERE user_id=uid AND job_id=p_job));
 IF j.id IS NULL THEN RAISE EXCEPTION 'Job unavailable'; END IF;
 INSERT INTO public.support_tickets(user_id,category,subject,job_center_id,tags) VALUES(uid,'other',left('Job report: '||j.title,120),p_job,ARRAY['job_report']) RETURNING id INTO ticket;
 INSERT INTO public.support_messages(ticket_id,sender,body) VALUES(ticket,'user','Job: '||j.title||' at '||j.company||E'\nJob ID: '||j.id||E'\nReason: '||p_reason||E'\n'||p_details);
 RETURN ticket;
END $$;
REVOKE ALL ON FUNCTION public.increment_job_apply(uuid),public.report_job_center(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.increment_job_apply(uuid),public.report_job_center(uuid,text,text) TO authenticated;