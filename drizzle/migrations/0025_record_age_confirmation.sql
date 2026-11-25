ALTER TABLE public.legal_acceptances ADD COLUMN IF NOT EXISTS age_confirmed boolean;

CREATE OR REPLACE FUNCTION public.record_signup_legal_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'account_type' = 'employer' THEN
    IF NEW.raw_user_meta_data ? 'employer_terms_version' AND NEW.raw_user_meta_data ? 'privacy_version' THEN
      INSERT INTO public.legal_acceptances (user_id, terms_version, privacy_version, employer_terms_version, source)
      VALUES (NEW.id, '', left(NEW.raw_user_meta_data->>'privacy_version', 40), left(NEW.raw_user_meta_data->>'employer_terms_version', 40), 'employer_signup');
    END IF;
  ELSIF NEW.raw_user_meta_data ? 'terms_version' AND NEW.raw_user_meta_data ? 'privacy_version' THEN
    INSERT INTO public.legal_acceptances (user_id, terms_version, privacy_version, source, age_confirmed)
    VALUES (NEW.id, left(NEW.raw_user_meta_data->>'terms_version', 40), left(NEW.raw_user_meta_data->>'privacy_version', 40), 'signup',
            NEW.raw_user_meta_data->>'age_confirmed' = 'true');
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$$;