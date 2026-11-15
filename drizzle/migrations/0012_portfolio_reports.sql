CREATE TABLE public.portfolio_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL CHECK (char_length(slug) <= 40),
  reason text NOT NULL CHECK (reason IN ('offensive','impersonation','confidential','spam','false_claims','other')),
  details text CHECK (details IS NULL OR char_length(details) <= 1000),
  contact_email text CHECK (contact_email IS NULL OR char_length(contact_email) <= 255),
  ip_hash text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_reports_ip_idx ON public.portfolio_reports (ip_hash, created_at);
GRANT SELECT, UPDATE ON public.portfolio_reports TO authenticated;
GRANT ALL ON public.portfolio_reports TO service_role;
ALTER TABLE public.portfolio_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Support staff read portfolio reports" ON public.portfolio_reports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_support_staff));
CREATE POLICY "Support staff resolve portfolio reports" ON public.portfolio_reports FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_support_staff))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_support_staff));