CREATE TABLE public.portfolios (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  slug text UNIQUE CHECK (slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  is_public boolean NOT NULL DEFAULT false,
  consented_at timestamptz,
  display_name text CHECK (char_length(display_name) <= 80),
  bio text CHECK (char_length(bio) <= 500),
  city text CHECK (char_length(city) <= 80),
  country text CHECK (char_length(country) <= 80),
  photo_path text,
  photo_version integer NOT NULL DEFAULT 0,
  credly_url text CHECK (char_length(credly_url) <= 300),
  show_linkedin boolean NOT NULL DEFAULT true,
  show_github boolean NOT NULL DEFAULT true,
  show_credly boolean NOT NULL DEFAULT true,
  show_other boolean NOT NULL DEFAULT true,
  show_scores boolean NOT NULL DEFAULT false,
  show_credentials boolean NOT NULL DEFAULT false,
  show_links boolean NOT NULL DEFAULT true,
  show_location boolean NOT NULL DEFAULT false,
  allow_indexing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.portfolios TO authenticated;
GRANT ALL ON public.portfolios TO service_role;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own portfolio" ON public.portfolios FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.portfolio_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.portfolios(user_id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.simulation_attempts(id) ON DELETE CASCADE,
  insight text CHECK (char_length(insight) <= 600),
  insight_generations integer NOT NULL DEFAULT 0,
  stage_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_projects_user_idx ON public.portfolio_projects(user_id);
GRANT SELECT ON public.portfolio_projects TO authenticated;
GRANT ALL ON public.portfolio_projects TO service_role;
ALTER TABLE public.portfolio_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own portfolio projects" ON public.portfolio_projects FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.portfolio_rate (
  rate_key text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (rate_key, window_start)
);
GRANT ALL ON public.portfolio_rate TO service_role;
ALTER TABLE public.portfolio_rate ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.portfolio_rate_hit(p_key text, p_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w timestamptz := date_trunc('minute', now()); n integer;
BEGIN
  DELETE FROM public.portfolio_rate WHERE window_start < now() - interval '5 minutes';
  INSERT INTO public.portfolio_rate(rate_key, window_start, hits) VALUES (left(p_key, 80), w, 1)
  ON CONFLICT (rate_key, window_start) DO UPDATE SET hits = portfolio_rate.hits + 1
  RETURNING hits INTO n;
  RETURN n <= p_limit;
END $$;
REVOKE ALL ON FUNCTION public.portfolio_rate_hit(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portfolio_rate_hit(text, integer) TO service_role;