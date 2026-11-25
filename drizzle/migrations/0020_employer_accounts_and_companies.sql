ALTER TABLE public.app_settings
 ADD COLUMN personal_email_domains text[] NOT NULL DEFAULT ARRAY['gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','ymail.com','rocketmail.com','hotmail.com','hotmail.co.uk','outlook.com','live.com','live.co.uk','msn.com','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me','gmx.com','gmx.net','gmx.de','mail.com','yandex.com','yandex.ru','zohomail.com','tutanota.com','tuta.io','fastmail.com','hey.com','qq.com','163.com','126.com','web.de','mail.ru','inbox.com','btinternet.com','sky.com','virginmedia.com'],
 ADD COLUMN disposable_email_domains text[] NOT NULL DEFAULT ARRAY['mailinator.com','guerrillamail.com','guerrillamail.net','sharklasers.com','10minutemail.com','temp-mail.org','tempmail.com','tempmailo.com','yopmail.com','trashmail.com','getnada.com','dispostable.com','maildrop.cc','throwawaymail.com','fakeinbox.com','mintemail.com','emailondeck.com','mohmal.com','moakt.com','burnermail.io'],
 ADD COLUMN employer_max_seats integer NOT NULL DEFAULT 5 CHECK (employer_max_seats BETWEEN 1 AND 100),
 ADD COLUMN company_delete_notice_days integer NOT NULL DEFAULT 30 CHECK (company_delete_notice_days BETWEEN 0 AND 365),
 ADD COLUMN employer_invite_days integer NOT NULL DEFAULT 7 CHECK (employer_invite_days BETWEEN 1 AND 30);

CREATE TABLE public.account_types (
 user_id uuid PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('candidate','employer')),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.account_types TO authenticated;
GRANT ALL ON public.account_types TO service_role;
ALTER TABLE public.account_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_types_own ON public.account_types FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_support_staff(auth.uid()));
INSERT INTO public.account_types (user_id, kind) SELECT id, 'candidate' FROM auth.users ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_employer(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.account_types WHERE user_id = _user_id AND kind = 'employer')
$$;

CREATE OR REPLACE FUNCTION public.assign_account_type() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; d text; s record;
BEGIN
  k := CASE WHEN NEW.raw_user_meta_data->>'account_type' = 'employer' THEN 'employer' ELSE 'candidate' END;
  IF k = 'employer' THEN
    d := lower(split_part(COALESCE(NEW.email, ''), '@', 2));
    SELECT personal_email_domains, disposable_email_domains INTO s FROM public.app_settings LIMIT 1;
    IF d = '' OR d = ANY(COALESCE(s.personal_email_domains, '{}')) OR d = ANY(COALESCE(s.disposable_email_domains, '{}'))
       OR d ~ '^(yahoo|hotmail|outlook|live)\.[a-z.]+$' THEN
      RAISE EXCEPTION 'work email required' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  INSERT INTO public.account_types (user_id, kind) VALUES (NEW.id, k) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.assign_account_type() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_account_type AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.assign_account_type();

ALTER TABLE public.legal_acceptances ADD COLUMN employer_terms_version text CHECK (employer_terms_version IS NULL OR char_length(employer_terms_version) <= 40);
ALTER TABLE public.legal_acceptances DROP CONSTRAINT legal_acceptances_source_check;
ALTER TABLE public.legal_acceptances ADD CONSTRAINT legal_acceptances_source_check CHECK (source IN ('signup','update_prompt','employer_signup','employer_invite'));

CREATE OR REPLACE FUNCTION public.record_signup_legal_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'account_type' = 'employer' THEN
    IF NEW.raw_user_meta_data ? 'employer_terms_version' AND NEW.raw_user_meta_data ? 'privacy_version' THEN
      INSERT INTO public.legal_acceptances (user_id, terms_version, privacy_version, employer_terms_version, source)
      VALUES (NEW.id, '', left(NEW.raw_user_meta_data->>'privacy_version', 40), left(NEW.raw_user_meta_data->>'employer_terms_version', 40), 'employer_signup');
    END IF;
  ELSIF NEW.raw_user_meta_data ? 'terms_version' AND NEW.raw_user_meta_data ? 'privacy_version' THEN
    INSERT INTO public.legal_acceptances (user_id, terms_version, privacy_version, source)
    VALUES (NEW.id, left(NEW.raw_user_meta_data->>'terms_version', 40), left(NEW.raw_user_meta_data->>'privacy_version', 40), 'signup');
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END;
$$;

CREATE TABLE public.companies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 180),
 website text NOT NULL CHECK (char_length(website) BETWEEN 1 AND 300),
 email_domain text NOT NULL CHECK (email_domain = lower(email_domain) AND char_length(email_domain) BETWEEN 3 AND 253),
 country text NOT NULL DEFAULT '' CHECK (char_length(country) <= 100),
 size_band text NOT NULL CHECK (size_band IN ('1-10','11-50','51-200','201-1000','1000+')),
 industry text NOT NULL CHECK (industry IN ('technology','finance','retail and ecommerce','healthcare','education','professional services','manufacturing','public sector and nonprofit','media and marketing','other')),
 description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
 registration_number text NOT NULL DEFAULT '' CHECK (char_length(registration_number) <= 60),
 public_page_url text NOT NULL DEFAULT '' CHECK (char_length(public_page_url) <= 300),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
 status_reason text NOT NULL DEFAULT '' CHECK (char_length(status_reason) <= 1000),
 reviewed_at timestamptz,
 delete_after timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX companies_email_domain_unique ON public.companies (email_domain);

CREATE TABLE public.company_members (
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 user_id uuid NOT NULL UNIQUE,
 role text NOT NULL CHECK (role IN ('owner','recruiter','viewer')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (company_id, user_id)
);
CREATE UNIQUE INDEX company_members_one_owner ON public.company_members (company_id) WHERE role = 'owner';

CREATE TABLE public.company_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 email text NOT NULL CHECK (email = lower(email) AND char_length(email) <= 254),
 role text NOT NULL CHECK (role IN ('recruiter','viewer')),
 token_hash text NOT NULL UNIQUE,
 invited_by uuid,
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_invites_company_idx ON public.company_invites (company_id);

CREATE TABLE public.company_join_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 user_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.company_staff_notes (
 company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
 notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 5000),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.company_audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 actor_id uuid,
 actor_kind text NOT NULL CHECK (actor_kind IN ('staff','employer','system')),
 action text NOT NULL CHECK (char_length(action) <= 60),
 reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_audit_company_idx ON public.company_audit_log (company_id, created_at DESC);
CREATE INDEX company_audit_actor_idx ON public.company_audit_log (actor_id);

GRANT SELECT ON public.companies, public.company_members, public.company_invites, public.company_join_requests, public.company_staff_notes, public.company_audit_log TO authenticated;
GRANT ALL ON public.companies, public.company_members, public.company_invites, public.company_join_requests, public.company_staff_notes, public.company_audit_log TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_staff_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.company_of(_user_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.company_members WHERE user_id = _user_id
$$;

CREATE POLICY companies_member_or_staff ON public.companies FOR SELECT TO authenticated USING (id = public.company_of(auth.uid()) OR public.is_support_staff(auth.uid()));
CREATE POLICY company_members_member_or_staff ON public.company_members FOR SELECT TO authenticated USING (company_id = public.company_of(auth.uid()) OR public.is_support_staff(auth.uid()));
CREATE POLICY company_invites_staff ON public.company_invites FOR SELECT TO authenticated USING (public.is_support_staff(auth.uid()));
CREATE POLICY company_join_requests_staff ON public.company_join_requests FOR SELECT TO authenticated USING (public.is_support_staff(auth.uid()));
CREATE POLICY company_staff_notes_staff ON public.company_staff_notes FOR SELECT TO authenticated USING (public.is_support_staff(auth.uid()));
CREATE POLICY company_audit_log_staff ON public.company_audit_log FOR SELECT TO authenticated USING (public.is_support_staff(auth.uid()));

-- Employer accounts are kept out of candidate records, whatever other policies allow.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['credentials','job_postings','job_tracker','job_preferences','simulation_attempts','attempt_task_results','attempt_deliverables','interview_prep_sessions','interview_prep_questions','interview_prep_responses','live_interviews','live_interview_messages','portfolios','portfolio_projects','application_profiles','application_snapshots','application_consents','simulations','simulation_tasks','job_center_jobs']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_employer(auth.uid())) WITH CHECK (NOT public.is_employer(auth.uid()))', t || '_not_employer', t);
  END LOOP;
END $$;