CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE private.app_keys (name text PRIMARY KEY, value text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON private.app_keys FROM PUBLIC, anon, authenticated;
ALTER TABLE private.app_keys ENABLE ROW LEVEL SECURITY;
INSERT INTO private.app_keys(name,value) VALUES ('billing_trial_hmac_key', encode(extensions.gen_random_bytes(32),'hex')) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.billing_hmac_of_md5(p_md5 text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; BEGIN
  SELECT value INTO k FROM private.app_keys WHERE name='billing_trial_hmac_key';
  IF k IS NULL THEN RAISE EXCEPTION 'Trial key missing'; END IF;
  RETURN encode(extensions.hmac(p_md5, k, 'sha256'),'hex');
END $$;
CREATE OR REPLACE FUNCTION public.billing_email_hash(p_email text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.billing_hmac_of_md5(md5(lower(trim(p_email)))) $$;
REVOKE ALL ON FUNCTION public.billing_hmac_of_md5(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_email_hash(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_email_hash(text) TO service_role;

UPDATE public.billing_trial_history SET email_hash=public.billing_hmac_of_md5(email_hash) WHERE length(email_hash)=32;

CREATE OR REPLACE FUNCTION public.register_billing_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN INSERT INTO public.billing_trial_history(email_hash,first_signup_at) SELECT public.billing_email_hash(email),created_at FROM auth.users WHERE id=NEW.id AND email IS NOT NULL ON CONFLICT DO NOTHING; RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.billing_access_for(p_user uuid, p_env text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cfg public.app_settings; ending timestamptz; signup timestamptz; identity text; sub public.subscriptions; paid boolean=false; sim_used integer; prep_used integer; BEGIN
IF p_env NOT IN ('sandbox','live') THEN RAISE EXCEPTION 'Invalid payment environment'; END IF;
SELECT * INTO cfg FROM public.app_settings WHERE id=true;
SELECT public.billing_email_hash(email),created_at INTO identity,signup FROM auth.users WHERE id=p_user;
IF identity IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
INSERT INTO public.billing_trial_history(email_hash,first_signup_at) VALUES(identity,signup) ON CONFLICT DO NOTHING;
IF cfg.paywall_enforced_since IS NOT NULL THEN UPDATE public.billing_trial_history SET trial_ends_at=greatest(first_signup_at,cfg.paywall_enforced_since)+make_interval(days=>cfg.trial_days) WHERE email_hash=identity AND trial_ends_at IS NULL; END IF;
SELECT trial_ends_at INTO ending FROM public.billing_trial_history WHERE email_hash=identity;
SELECT * INTO sub FROM public.subscriptions WHERE user_id=p_user AND environment=p_env AND price_id='roleprove_practice_prep_monthly' ORDER BY (CASE WHEN status IN ('active','trialing','past_due') THEN 0 ELSE 1 END),created_at DESC LIMIT 1;
paid=COALESCE((sub.status IN ('active','trialing') AND (sub.current_period_end IS NULL OR sub.current_period_end+interval '1 day'>now())) OR (sub.status='canceled' AND sub.current_period_end>now()) OR (sub.status='past_due' AND sub.past_due_since+interval '7 days'>now()),false);
SELECT count(*) FILTER(WHERE kind='simulation'),count(*) FILTER(WHERE kind='interview_prep') INTO sim_used,prep_used FROM public.billing_usage WHERE user_id=p_user AND environment=p_env AND started_at>=ending AND started_at>=cfg.paywall_enforced_since AND (status='succeeded' OR (status='pending' AND expires_at>now()));
RETURN jsonb_build_object('enforced',cfg.paywall_enforced,'trialEndsAt',ending,'trialDaysLeft',CASE WHEN ending>now() THEN ceil(extract(epoch FROM ending-now())/86400)::integer ELSE 0 END,'trialActive',COALESCE(ending>now(),false),'paid',paid,'subscriptionStatus',COALESCE(sub.status,'none'),'periodEnd',sub.current_period_end,'cancelAtPeriodEnd',COALESCE(sub.cancel_at_period_end,false),'simulationsLeft',greatest(0,cfg.free_simulations-sim_used),'interviewPrepLeft',greatest(0,cfg.free_interview_prep-prep_used)); END $function$;

CREATE TABLE public.data_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'building' CHECK (status IN ('building','ready','downloaded','expired','failed')),
  file_path text,
  failed_section text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  downloaded_at timestamptz
);
CREATE INDEX data_exports_user_created ON public.data_exports(user_id, created_at DESC);
GRANT SELECT ON public.data_exports TO authenticated;
GRANT ALL ON public.data_exports TO service_role;
ALTER TABLE public.data_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see their own exports" ON public.data_exports FOR SELECT TO authenticated USING (auth.uid() = user_id);