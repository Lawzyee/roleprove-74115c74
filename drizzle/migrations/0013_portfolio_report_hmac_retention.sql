INSERT INTO private.app_keys(name,value) VALUES ('portfolio_report_ip_hmac_key', encode(extensions.gen_random_bytes(32),'hex')) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.portfolio_report_ip_hash(p_ip text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; BEGIN
  SELECT value INTO k FROM private.app_keys WHERE name='portfolio_report_ip_hmac_key';
  IF k IS NULL THEN RAISE EXCEPTION 'Report key missing'; END IF;
  RETURN encode(extensions.hmac(coalesce(p_ip,'unknown'), k, 'sha256'),'hex');
END $$;
REVOKE ALL ON FUNCTION public.portfolio_report_ip_hash(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portfolio_report_ip_hash(text) TO service_role;
ALTER TABLE public.portfolio_reports ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
UPDATE public.portfolio_reports SET resolved_at = now() WHERE status = 'resolved' AND resolved_at IS NULL;
-- Old plain-hash rows can't be re-keyed (the address isn't stored); give them an unlinkable keyed value.
UPDATE public.portfolio_reports SET ip_hash = public.portfolio_report_ip_hash('legacy:' || id::text);
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS report_resolved_retention_days integer NOT NULL DEFAULT 90 CHECK (report_resolved_retention_days BETWEEN 1 AND 3650);
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS report_open_retention_days integer NOT NULL DEFAULT 365 CHECK (report_open_retention_days BETWEEN 1 AND 3650);
CREATE OR REPLACE FUNCTION public.portfolio_reports_set_resolved_at() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved' THEN NEW.resolved_at = now();
  ELSIF NEW.status <> 'resolved' THEN NEW.resolved_at = NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER portfolio_reports_resolved_at BEFORE UPDATE ON public.portfolio_reports FOR EACH ROW EXECUTE FUNCTION public.portfolio_reports_set_resolved_at();