ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS daily_generation_cap integer NOT NULL DEFAULT 10 CHECK (daily_generation_cap >= 0);
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS launch_free_until date;
-- Fair-use cap runs before (and independently of) the paywall check; pending reservations count to stop parallel bypass, released ones never count.
CREATE FUNCTION public.reserve_generation(p_user uuid,p_env text,p_kind text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE cap integer; used integer; BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||'daily',0));
SELECT daily_generation_cap INTO cap FROM public.app_settings LIMIT 1;
SELECT count(*) INTO used FROM public.billing_usage WHERE user_id=p_user AND started_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND (status='succeeded' OR (status='pending' AND expires_at>now()));
IF used>=COALESCE(cap,10) THEN RETURN jsonb_build_object('allowed',false,'reason','daily_cap'); END IF;
RETURN public.reserve_billing_usage(p_user,p_env,p_kind); END $$;
REVOKE ALL ON FUNCTION public.reserve_generation(uuid,text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.reserve_generation(uuid,text,text) TO service_role;