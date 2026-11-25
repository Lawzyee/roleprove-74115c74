import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { CATEGORY_LABELS, EMAIL_DEFAULTS, NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications";

type Col = `email_${NotificationType}`;

export function NotificationSettingsCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["notification-settings", user?.id];
  const { data } = useQuery({
    queryKey: key, enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("notification_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const value = (t: NotificationType) => (data ? Boolean((data as Record<string, unknown>)[`email_${t}`]) : EMAIL_DEFAULTS[t]);

  async function set(t: NotificationType, v: boolean) {
    if (!user) return;
    const row: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };
    for (const k of NOTIFICATION_TYPES) row[`email_${k}` as Col] = k === t ? v : value(k);
    const { error } = await supabase.from("notification_settings").upsert(row as never, { onConflict: "user_id" });
    if (error) toast.error("Could not save your notification settings.");
    qc.invalidateQueries({ queryKey: key });
  }

  return (
    <Card className="border-border shadow-none">
      <CardHeader>
        <CardTitle className="font-display text-lg">Inbox notifications</CardTitle>
        <CardDescription>Every notification appears in your inbox. Choose which ones also send an email. Emails only tell you there is something new; sign in to read it.</CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="py-2 font-medium">Category</th><th className="px-2 font-medium">In app</th><th className="font-medium">Also email me</th></tr></thead>
          <tbody>
            {NOTIFICATION_TYPES.map((t) => (
              <tr key={t} className="border-t border-border">
                <td className="py-2.5 pr-2">{CATEGORY_LABELS[t]}</td>
                <td className="px-2"><Switch checked disabled aria-label={`${CATEGORY_LABELS[t]} in app (always on)`} /></td>
                <td><Switch checked={value(t)} onCheckedChange={(v) => set(t, v)} aria-label={`Email me about ${CATEGORY_LABELS[t].toLowerCase()}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
