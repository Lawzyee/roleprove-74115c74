CREATE TABLE public.employer_waitlist (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 full_name text NOT NULL DEFAULT '' CHECK (char_length(full_name)<=180),
 email text NOT NULL UNIQUE CHECK (char_length(email)<=254 AND email=lower(email)),
 company text NOT NULL DEFAULT '' CHECK (char_length(company)<=180),
 job_title text NOT NULL DEFAULT '' CHECK (char_length(job_title)<=180),
 company_size text CHECK (company_size IS NULL OR company_size IN ('1-10','11-50','51-200','201-1000','1000+')),
 country text NOT NULL DEFAULT '' CHECK (char_length(country)<=100),
 roles text[] NOT NULL DEFAULT '{}', other_role text NOT NULL DEFAULT '' CHECK (char_length(other_role)<=100),
 hiring_types text[] NOT NULL DEFAULT '{}', arrangements text[] NOT NULL DEFAULT '{}',
 hires_per_year text CHECK (hires_per_year IS NULL OR hires_per_year IN ('1-2','3-10','11+')),
 message text NOT NULL DEFAULT '' CHECK (char_length(message)<=2000),
 personal_email boolean NOT NULL DEFAULT false,
 consent_at timestamptz NOT NULL DEFAULT now(),
 confirm_token_hash text, remove_token_hash text NOT NULL,
 confirmed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employer_waitlist_confirm_idx ON public.employer_waitlist(confirm_token_hash);
CREATE INDEX employer_waitlist_remove_idx ON public.employer_waitlist(remove_token_hash);
GRANT SELECT ON public.employer_waitlist TO authenticated;
GRANT ALL ON public.employer_waitlist TO service_role;
ALTER TABLE public.employer_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Support staff read employer waitlist" ON public.employer_waitlist FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_support_staff));

CREATE TABLE public.employer_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL CHECK (char_length(email)<=254 AND email=lower(email)),
 token_hash text NOT NULL UNIQUE,
 confirmed_at timestamptz, expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.employer_sessions TO service_role;
ALTER TABLE public.employer_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employer_rate_hits (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 kind text NOT NULL, ip_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employer_rate_hits_idx ON public.employer_rate_hits(kind, ip_hash, created_at);
GRANT ALL ON public.employer_rate_hits TO service_role;
ALTER TABLE public.employer_rate_hits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.job_center_private ADD COLUMN reject_reason text CHECK (reject_reason IS NULL OR reject_reason IN ('looks like a scam','duplicate','link not working','not a real job','other'));
ALTER TABLE public.job_center_private ADD COLUMN reject_note text NOT NULL DEFAULT '' CHECK (char_length(reject_note)<=1000);
ALTER TABLE public.job_center_private ADD COLUMN reviewed_at timestamptz;
ALTER TABLE public.job_center_private ADD COLUMN removal_token_hash text;
CREATE INDEX job_private_removal_idx ON public.job_center_private(removal_token_hash);

ALTER TABLE public.app_settings
 ADD COLUMN employer_daily_submissions integer NOT NULL DEFAULT 3 CHECK (employer_daily_submissions BETWEEN 0 AND 100),
 ADD COLUMN employer_max_pending integer NOT NULL DEFAULT 10 CHECK (employer_max_pending BETWEEN 0 AND 500),
 ADD COLUMN employer_unconfirmed_days integer NOT NULL DEFAULT 7 CHECK (employer_unconfirmed_days BETWEEN 1 AND 365),
 ADD COLUMN employer_pending_days integer NOT NULL DEFAULT 30 CHECK (employer_pending_days BETWEEN 1 AND 365),
 ADD COLUMN employer_rejected_days integer NOT NULL DEFAULT 90 CHECK (employer_rejected_days BETWEEN 1 AND 3650),
 ADD COLUMN employer_contact_days integer NOT NULL DEFAULT 90 CHECK (employer_contact_days BETWEEN 1 AND 3650),
 ADD COLUMN employer_waitlist_max_months integer DEFAULT 24 CHECK (employer_waitlist_max_months IS NULL OR employer_waitlist_max_months BETWEEN 1 AND 240),
 ADD COLUMN hiring_software_domains text[] NOT NULL DEFAULT ARRAY['greenhouse.io','lever.co','ashbyhq.com','workable.com','smartrecruiters.com','bamboohr.com','recruitee.com','teamtailor.com','personio.com','myworkdayjobs.com','jobvite.com','breezy.hr'];