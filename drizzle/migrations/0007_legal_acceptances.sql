CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'signup' CHECK (source IN ('signup','update_prompt'))
);
CREATE INDEX legal_acceptances_user_idx ON public.legal_acceptances (user_id, accepted_at DESC);
GRANT SELECT, INSERT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own acceptances" ON public.legal_acceptances FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users record own acceptance" ON public.legal_acceptances FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND source = 'update_prompt' AND length(terms_version) <= 40 AND length(privacy_version) <= 40);

CREATE OR REPLACE FUNCTION public.record_signup_legal_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'terms_version' AND NEW.raw_user_meta_data ? 'privacy_version' THEN
    INSERT INTO public.legal_acceptances (user_id, terms_version, privacy_version, source)
    VALUES (NEW.id, left(NEW.raw_user_meta_data->>'terms_version', 40), left(NEW.raw_user_meta_data->>'privacy_version', 40), 'signup');
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_signup_legal_acceptance() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_legal_acceptance AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.record_signup_legal_acceptance();