import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AccountKind = "candidate" | "employer";
/** Reads the signed-in person's own account type (row-level security lets each person read only their own). */
export async function fetchAccountKind(userId: string): Promise<AccountKind> {
  const { data } = await supabase.from("account_types").select("kind").eq("user_id", userId).maybeSingle();
  return data?.kind === "employer" ? "employer" : "candidate";
}
export function useAccountKind() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["account-kind", user?.id], enabled: !!user, staleTime: 5 * 60_000, queryFn: () => fetchAccountKind(user!.id) });
}
/** Pages an employer account may open; everything else under sign-in is for candidates. */
export function employerMayOpen(pathname: string) {
  return pathname === "/employer" || pathname.startsWith("/employer/") || pathname === "/inbox" || pathname.startsWith("/support");
}
export function isEmployerArea(pathname: string) {
  return pathname === "/employer" || pathname.startsWith("/employer/");
}
