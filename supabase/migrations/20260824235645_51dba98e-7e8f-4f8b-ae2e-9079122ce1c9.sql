ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS target_role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL;

UPDATE public.profiles
SET headline = target_role
WHERE (headline IS NULL OR btrim(headline) = '')
  AND target_role IS NOT NULL AND btrim(target_role) <> '';

UPDATE public.profiles SET target_role = NULL WHERE target_role IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, headline, location, target_role_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'headline', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'location', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'target_role_id', '')::uuid
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;