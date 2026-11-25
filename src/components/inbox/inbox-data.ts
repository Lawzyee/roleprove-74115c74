import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PAGE_SIZE } from "@/lib/notifications";

export type InboxItem = { id: string; type: string; title: string; body: string; link: string | null; created_at: string; read_at: string | null };
const REFRESH = 120_000; // every two minutes, plus on window focus

export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["inbox", "unread", user?.id],
    enabled: !!user,
    refetchInterval: REFRESH,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useInboxPage(page: number, unreadOnly: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["inbox", "list", user?.id, page, unreadOnly],
    enabled: !!user,
    refetchInterval: REFRESH,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let q = supabase.from("notifications").select("id,type,title,body,link,created_at,read_at", { count: "exact" })
        .order("created_at", { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (unreadOnly) q = q.is("read_at", null);
      const { data, count, error } = await q;
      if (error) throw error;
      return { items: (data ?? []) as InboxItem[], total: count ?? 0 };
    },
  });
}
