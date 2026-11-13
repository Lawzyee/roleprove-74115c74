DROP POLICY IF EXISTS "settings_read" ON public.app_settings;

DROP POLICY IF EXISTS "simulations readable" ON public.simulations;
CREATE POLICY "simulations readable" ON public.simulations FOR SELECT TO authenticated
USING (is_personalized = false OR owner_user_id = auth.uid());

DROP POLICY IF EXISTS "tasks readable" ON public.simulation_tasks;
CREATE POLICY "tasks readable" ON public.simulation_tasks FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.simulations s WHERE s.id = simulation_id AND (s.is_personalized = false OR s.owner_user_id = auth.uid())));

DROP POLICY IF EXISTS "roles readable" ON public.roles;
CREATE POLICY "roles readable" ON public.roles FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);