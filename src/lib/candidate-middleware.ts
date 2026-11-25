import { createMiddleware } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Signed-in candidate (or staff) only. Employer accounts are refused on the server, not just hidden in the menus. */
export const requireCandidate = createMiddleware({ type: 'function' })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc('is_employer', { _user_id: context.userId });
    if (error) throw new Error('Could not check your account. Please try again.');
    if (data === true) throw new Error('This is not available for employer accounts.');
    return next();
  });
