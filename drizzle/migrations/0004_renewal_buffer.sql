CREATE OR REPLACE FUNCTION public.billing_access_for(p_user uuid, p_env text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cfg public.app_settings; ending timestamptz; signup timestamptz; identity text; sub public.subscriptions; paid boolean=false; sim_used integer; prep_used integer; BEGIN
IF p_env NOT IN ('sandbox','live') THEN RAISE EXCEPTION 'Invalid payment environment'; END IF;
SELECT * INTO cfg FROM public.app_settings WHERE id=true;
SELECT md5(lower(trim(email))),created_at INTO identity,signup FROM auth.users WHERE id=p_user;
IF identity IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
INSERT INTO public.billing_trial_history(email_hash,first_signup_at) VALUES(identity,signup) ON CONFLICT DO NOTHING;
IF cfg.paywall_enforced_since IS NOT NULL THEN UPDATE public.billing_trial_history SET trial_ends_at=greatest(first_signup_at,cfg.paywall_enforced_since)+make_interval(days=>cfg.trial_days) WHERE email_hash=identity AND trial_ends_at IS NULL; END IF;
SELECT trial_ends_at INTO ending FROM public.billing_trial_history WHERE email_hash=identity;
SELECT * INTO sub FROM public.subscriptions WHERE user_id=p_user AND environment=p_env AND price_id='roleprove_practice_prep_monthly' ORDER BY (CASE WHEN status IN ('active','trialing','past_due') THEN 0 ELSE 1 END),created_at DESC LIMIT 1;
-- Active renewals get a 1-day buffer so a late renewal confirmation never locks out a paying customer.
paid=COALESCE((sub.status IN ('active','trialing') AND (sub.current_period_end IS NULL OR sub.current_period_end+interval '1 day'>now())) OR (sub.status='canceled' AND sub.current_period_end>now()) OR (sub.status='past_due' AND sub.past_due_since+interval '7 days'>now()),false);
SELECT count(*) FILTER(WHERE kind='simulation'),count(*) FILTER(WHERE kind='interview_prep') INTO sim_used,prep_used FROM public.billing_usage WHERE user_id=p_user AND environment=p_env AND started_at>=ending AND started_at>=cfg.paywall_enforced_since AND (status='succeeded' OR (status='pending' AND expires_at>now()));
RETURN jsonb_build_object('enforced',cfg.paywall_enforced,'trialEndsAt',ending,'trialDaysLeft',CASE WHEN ending>now() THEN ceil(extract(epoch FROM ending-now())/86400)::integer ELSE 0 END,'trialActive',COALESCE(ending>now(),false),'paid',paid,'subscriptionStatus',COALESCE(sub.status,'none'),'periodEnd',sub.current_period_end,'cancelAtPeriodEnd',COALESCE(sub.cancel_at_period_end,false),'simulationsLeft',greatest(0,cfg.free_simulations-sim_used),'interviewPrepLeft',greatest(0,cfg.free_interview_prep-prep_used)); END $function$;