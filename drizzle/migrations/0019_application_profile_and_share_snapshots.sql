CREATE TABLE public.application_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name text,
  headline text,
  bio text,
  include_headline boolean NOT NULL DEFAULT true,
  include_bio boolean NOT NULL DEFAULT false,
  include_target_score boolean NOT NULL DEFAULT true,
  include_pillars boolean NOT NULL DEFAULT false,
  project_attempt_ids uuid[] NOT NULL DEFAULT '{}',
  credential_ids uuid[] NOT NULL DEFAULT '{}',
  cv_session_id uuid,
  include_links boolean NOT NULL DEFAULT false,
  linkedin_url text,
  github_url text,
  other_url text,
  include_location boolean NOT NULL DEFAULT false,
  city text,
  country text,
  include_work boolean NOT NULL DEFAULT false,
  work_arrangement text,
  availability text,
  include_photo boolean NOT NULL DEFAULT false,
  contact_mode text NOT NULL DEFAULT 'inbox' CHECK (contact_mode IN ('inbox','email')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.application_profiles TO authenticated;
GRANT ALL ON public.application_profiles TO service_role;
ALTER TABLE public.application_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own application profile" ON public.application_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.application_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content jsonb NOT NULL,
  included_items text[] NOT NULL,
  replaces_snapshot_id uuid REFERENCES public.application_snapshots(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz
);
CREATE INDEX application_snapshots_user_idx ON public.application_snapshots(user_id);
GRANT SELECT ON public.application_snapshots TO authenticated;
GRANT ALL ON public.application_snapshots TO service_role;
ALTER TABLE public.application_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own snapshots" ON public.application_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.application_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_id uuid NOT NULL REFERENCES public.application_snapshots(id) ON DELETE CASCADE,
  included_items text[] NOT NULL,
  wording_version text NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  employer_ref text,
  job_id uuid,
  withdrawn_at timestamptz
);
CREATE INDEX application_consents_user_idx ON public.application_consents(user_id);
GRANT SELECT ON public.application_consents TO authenticated;
GRANT ALL ON public.application_consents TO service_role;
ALTER TABLE public.application_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own consents" ON public.application_consents FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Snapshots are frozen: only withdrawn_at may change, and only from empty to a time.
CREATE OR REPLACE FUNCTION public.freeze_application_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content OR NEW.included_items IS DISTINCT FROM OLD.included_items
     OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.replaces_snapshot_id IS DISTINCT FROM OLD.replaces_snapshot_id THEN
    RAISE EXCEPTION 'Share snapshots cannot be changed after creation';
  END IF;
  IF OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at THEN
    RAISE EXCEPTION 'A withdrawn snapshot stays withdrawn';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER application_snapshots_frozen BEFORE UPDATE ON public.application_snapshots FOR EACH ROW EXECUTE FUNCTION public.freeze_application_snapshot();

CREATE OR REPLACE FUNCTION public.freeze_application_consent() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.included_items IS DISTINCT FROM OLD.included_items OR NEW.wording_version IS DISTINCT FROM OLD.wording_version
     OR NEW.consented_at IS DISTINCT FROM OLD.consented_at OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id THEN
    RAISE EXCEPTION 'Consent records cannot be changed after creation';
  END IF;
  IF OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at THEN
    RAISE EXCEPTION 'A withdrawn consent stays withdrawn';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER application_consents_frozen BEFORE UPDATE ON public.application_consents FOR EACH ROW EXECUTE FUNCTION public.freeze_application_consent();