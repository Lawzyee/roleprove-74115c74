REVOKE ALL ON public.job_applications FROM anon, authenticated;
GRANT SELECT (id, job_id, company_id, job_title, company_name, status, created_at, viewed_at, status_changed_at, withdrawn_at, job_ended_at) ON public.job_applications TO authenticated;
REVOKE ALL ON public.application_access_log FROM anon, authenticated;
GRANT SELECT ON public.application_access_log TO authenticated;