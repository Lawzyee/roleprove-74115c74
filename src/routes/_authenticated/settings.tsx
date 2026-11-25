import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { NotificationSettingsCard } from "@/components/inbox/NotificationSettingsCard";
import { getStripeEnvironment } from "@/lib/stripe";
import { deleteAccountFn } from "@/lib/payments.functions";
import { confirmExportDownloaded, requestDataExport } from "@/lib/data-export.functions";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Link } from "@tanstack/react-router";

import { BillingStatus } from '@/components/BillingStatus';
import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
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
  const [reauthOpen, setReauthOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportBlob, setExportBlob] = useState<Blob | null>(null);
  const requestExport = useServerFn(requestDataExport);
  const confirmDownloaded = useServerFn(confirmExportDownloaded);

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function toggle(field: "profile_visible" | "email_notifications", value: boolean) {
    if (!user) return;
    const patch =
      field === "profile_visible" ? { profile_visible: value } : { email_notifications: value };
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }

  async function exportData(password?: string) {
    if (!user) return;
    setBusy(true);
    try {
      if (password) {
        const { error } = await supabase.auth.signInWithPassword({ email: user.email ?? "", password });
        if (error) return toast.error("That password is not correct.");
        setReauthOpen(false); setPassword("");
      }
      setExportStatus("Building your export… this can take a minute.");
      const result = await requestExport();
      if ("error" in result) {
        if (result.code === "reauth") { setExportStatus(null); setReauthOpen(true); return; }
        setExportStatus(null);
        return toast.error(result.error, { duration: 12000 });
      }
      const res = await fetch(result.url);
      if (!res.ok) { setExportStatus(null); return toast.error("Your export was created but could not be fetched. Please contact support."); }
      const blob = await res.blob();
      await confirmDownloaded({ data: { exportId: result.exportId } });
      setExportBlob(blob);
      setExportStatus(result.largeRecordings ? `Ready. ${result.largeRecordings} large recording(s) are links inside the zip that stop working in 1 hour.` : "Your export is ready.");
    } finally {
      setBusy(false);
    }
  }

  function saveExport() {
    if (!exportBlob) return;
    const url = URL.createObjectURL(exportBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roleprove-data-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function deleteData() {
    if (!user) return;
    if (!window.confirm("This cancels any subscription immediately (no refund) and permanently deletes your account, profile, credentials, simulation history, support tickets and any attempt recordings. Continue?")) return;
    setBusy(true);
    const result = await deleteAccountFn({ data: { environment: getStripeEnvironment() } });
    if ('error' in result) { setBusy(false); return toast.error(`Could not delete your account: ${result.error}`); }
    await supabase.auth.signOut();
    setBusy(false);
    toast.success("Your data has been deleted");
    if (result.keptForBilling.length) toast.info("Because of an unpaid invoice or open payment dispute, our payment provider keeps a record of that payment, with your name, email and account ID removed.");
    router.navigate({ to: "/" });
  }

  const profile = profileQuery.data;

  return (
    <>
      <PaymentTestModeBanner />
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <BillingStatus detailed />
        <p className="mt-4 text-sm text-muted-foreground">Need help? Visit the <Link to="/help" className="text-primary underline">Help centre</Link> or <Link to="/support" className="text-primary underline">your support tickets</Link>.</p>

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
              <CardTitle className="font-display text-lg">Application profile</CardTitle>
              <CardDescription>Choose what an employer may see when you apply. Nothing is shared until you apply and confirm.</CardDescription>
            </CardHeader>
            <CardContent><Button asChild variant="outline"><Link to="/application-profile">Set up application profile</Link></Button></CardContent>
          </Card>

          <NotificationSettingsCard />

          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-lg">Legal</CardTitle>
              <CardDescription>How RoleProve works, and how we handle your data.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link to="/terms" className="text-primary underline">Terms of Service</Link>
              <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>
              <Link to="/cookies" className="text-primary underline">Cookie Notice</Link>
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-lg">Your data</CardTitle>
              <CardDescription>Export a copy of everything, or delete it permanently.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => exportData()} disabled={busy}>
                Export my data
              </Button>
              {exportBlob && <Button onClick={saveExport}>Download zip</Button>}
              <Button variant="destructive" onClick={deleteData} disabled={busy}>
                Delete my data
              </Button>
              {exportStatus && <p className="w-full text-sm text-muted-foreground" role="status">{exportStatus}</p>}
            </CardContent>
          </Card>
        </div>
      </main>
      <Dialog open={reauthOpen} onOpenChange={setReauthOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm it's you</DialogTitle>
            <DialogDescription>Enter your password to export your data. We'll email you to say an export was requested.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); void exportData(password); }} className="space-y-3">
            <Label htmlFor="reauth-password">Password</Label>
            <Input id="reauth-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <DialogFooter><Button type="submit" disabled={busy || !password}>Confirm and export</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
