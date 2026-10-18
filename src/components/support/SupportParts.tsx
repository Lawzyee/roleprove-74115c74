import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { hasUnreadReply, statusLabel, type TicketStatus } from '@/lib/support';
import { checkAttachment } from '@/lib/support';

export function StatusBadge({ status }: { status: string }) {
  const s = status as TicketStatus;
  return <Badge variant={s === 'resolved' ? 'secondary' : s === 'replied' ? 'default' : 'outline'}>{statusLabel[s] ?? status}</Badge>;
}

export function useMyTickets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['support-tickets', user?.id], enabled: Boolean(user), refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from('support_tickets')
        .select('id, category, subject, status, created_at, updated_at, user_last_read_at, support_messages(sender, created_at)')
        .eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t) => ({ ...t, unread: hasUnreadReply(t.user_last_read_at, t.support_messages ?? []) }));
    },
  });
}

export async function uploadScreenshot(userId: string, file: File) {
  const problem = checkAttachment(file.type, file.size);
  if (problem) throw new Error(problem);
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('support-attachments').upload(path, file, { contentType: file.type });
  if (error) throw new Error('Could not upload the screenshot.');
  return { path, name: file.name.slice(0, 200) };
}
