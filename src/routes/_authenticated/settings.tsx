import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings | RoleProve" },
      { name: "description", content: "Control profile visibility, notifications and your RoleProve data." },
      { property: "og:title", content: "Settings | RoleProve" },
      { property: "og:description", content: "Control profile visibility, notifications and your RoleProve data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function toggle(field: "profile_visible" | "email_notifications", value: boolean) {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }

  async function exportData() {
    if (!user) return;
    setBusy(true);
    const [profile, credentials, attempts, results] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id),
      supabase.from("credentials").select("*").eq("user_id", user.id),
      supabase.from("simulation_attempts").select("*").eq("user_id", user.id),
      supabase.from("attempt_task_results").select("*"),
    ]);
    const blob = new Blob(
      [
        JSON.stringify(
          {
            profile: profile.data,
            credentials: credentials.data,
            attempts: attempts.data,
            task_results: results.data,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roleprove-data.json";
    a.click();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  async function deleteData() {
    if (!user) return;
    if (!window.confirm("This permanently deletes your profile, credentials and simulation history. Continue?")) return;
    setBusy(true);
    await supabase.from("simulation_attempts").delete().eq("user_id", user.id);
    await supabase.from("credentials").delete().eq("user_id", user.id);
    await supabase.from("profiles").delete().eq("id", user.id);
    await supabase.auth.signOut();
    setBusy(false);
    toast.success("Your data has been deleted");
    router.navigate({ to: "/" });
  }

  const profile = profileQuery.data;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">Settings</h1>

        <div className="mt-8 space-y-6">
          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-lg">Visibility</CardTitle>
              <CardDescription>
                Employer discovery isn't live yet — this preference will apply when it launches.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <Label htmlFor="visible">Make my profile and score visible</Label>
              <Switch
                id="visible"
                checked={!!profile?.profile_visible}
                onCheckedChange={(v) => toggle("profile_visible", v)}
              />
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-lg">Notifications</CardTitle>
              <CardDescription>Occasional emails about new simulations and your score.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <Label htmlFor="emails">Email notifications</Label>
              <Switch
                id="emails"
                checked={!!profile?.email_notifications}
                onCheckedChange={(v) => toggle("email_notifications", v)}
              />
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-lg">Your data</CardTitle>
              <CardDescription>Export a copy of everything, or delete it permanently.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={exportData} disabled={busy}>
                Export my data
              </Button>
              <Button variant="destructive" onClick={deleteData} disabled={busy}>
                Delete my data
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
