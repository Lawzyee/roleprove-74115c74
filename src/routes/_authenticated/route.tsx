import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { employerMayOpen, fetchAccountKind, isEmployerArea } from "@/hooks/useAccountKind";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Candidate and employer accounts are kept apart (also enforced on the server and by row-level security).
    const kind = await fetchAccountKind(data.user.id);
    if (kind === "employer" && !employerMayOpen(location.pathname)) throw redirect({ to: "/employer" });
    if (kind !== "employer" && isEmployerArea(location.pathname)) throw redirect({ to: "/dashboard" });
    return { user: data.user, accountKind: kind };
  },
  component: () => <Outlet />,
});
