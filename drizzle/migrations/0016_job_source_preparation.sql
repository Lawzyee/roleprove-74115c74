ALTER TABLE public.job_center_jobs ADD COLUMN source_type text NOT NULL DEFAULT 'staff' CHECK (source_type IN ('staff','company_board','employer_submitted'));
ALTER TABLE public.job_center_jobs ADD COLUMN source_ref text;
ALTER TABLE public.job_center_jobs ADD COLUMN external_id text;
ALTER TABLE public.job_center_jobs ADD COLUMN apply_url_hash text;
CREATE UNIQUE INDEX jobs_source_external_unique ON public.job_center_jobs(source_ref, external_id) WHERE source_ref IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX jobs_apply_url_hash ON public.job_center_jobs(apply_url_hash);
ALTER TABLE public.job_center_jobs DROP CONSTRAINT job_center_jobs_status_check;
ALTER TABLE public.job_center_jobs ADD CONSTRAINT job_center_jobs_status_check CHECK(status IN ('draft','pending_review','published','rejected','expired','hidden'));
ALTER TABLE public.job_center_private ADD COLUMN submitter_name text NOT NULL DEFAULT '';
ALTER TABLE public.job_center_private ADD COLUMN submitter_email text NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION public.normalized_job_apply_url(value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT 'https://' || regexp_replace(lower(substring(btrim(value) from '^https://([^/?#]+)')), ':443$', '') ||
 regexp_replace(split_part(regexp_replace(btrim(value), '^https://[^/?#]+', ''), '#', 1), '^/+(\?|$)', '\1')
$$;
CREATE OR REPLACE FUNCTION public.set_job_apply_hash() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 NEW.apply_url_hash := encode(sha256(convert_to(public.normalized_job_apply_url(NEW.apply_url), 'UTF8')), 'hex');
 RETURN NEW;
END $$;
CREATE TRIGGER job_apply_hash BEFORE INSERT OR UPDATE OF apply_url, apply_url_hash ON public.job_center_jobs FOR EACH ROW EXECUTE FUNCTION public.set_job_apply_hash();
UPDATE public.job_center_jobs SET apply_url_hash=encode(sha256(convert_to(public.normalized_job_apply_url(apply_url),'UTF8')),'hex');
COMMENT ON COLUMN public.job_center_jobs.apply_url_hash IS 'SHA-256 of HTTPS application URL with lowercase authority, default port removed, fragment removed and root slash normalized; query and path case preserved. Indexed for duplicate detection, not uniqueness.';
CREATE TABLE public.job_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_name text NOT NULL, company_website text NOT NULL,
 board_type text NOT NULL CHECK(board_type IN ('greenhouse','lever','ashby','other')), board_identifier text NOT NULL,
 enabled boolean NOT NULL DEFAULT true, auto_publish boolean NOT NULL DEFAULT false,
 last_synced_at timestamptz, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_sources TO authenticated;
GRANT ALL ON public.job_sources TO service_role;
ALTER TABLE public.job_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_sources_staff ON public.job_sources TO authenticated USING(public.is_support_staff(auth.uid())) WITH CHECK(public.is_support_staff(auth.uid()));