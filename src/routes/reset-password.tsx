import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAccountKind } from "@/hooks/useAccountKind";
import { authErrorMessage } from "@/lib/auth-flow";
import { homeFor } from "@/lib/auth-entry";

const DESC = "Choose a new password for your RoleProve account.";
export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [
    { title: "Choose a new password | RoleProve" },
    { name: "description", content: DESC },
    { property: "og:title", content: "Choose a new password | RoleProve" },
    { property: "og:description", content: DESC },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: ResetPassword,
});

function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.has("error")) { setReady("invalid"); return; }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setReady("ok"); });
    // getSession waits for the recovery link to be processed.
    supabase.auth.getSession().then(({ data }) => setReady((r) => (r === "ok" ? r : data.session ? "ok" : "invalid")));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return setError("Please choose a password with at least 6 characters.");
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err || !data.user) return setError(authErrorMessage(err));
    toast.success("Password updated.");
    await router.navigate({ to: homeFor(await fetchAccountKind(data.user.id)), replace: true });
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center px-4 py-10 sm:px-5">
      <Card className="border-border shadow-none">
        <CardHeader><CardTitle className="font-display text-2xl"><h1>Choose a new password</h1></CardTitle><CardDescription>{DESC}</CardDescription></CardHeader>
        <CardContent>
          {ready === "checking" ? <p role="status" className="text-sm text-muted-foreground">Checking your link…</p>
          : ready === "invalid" ? <div className="space-y-3"><p role="alert" className="text-sm text-destructive">This reset link is invalid or has expired.</p><Link to="/" className="text-sm text-primary underline">Back to sign in to request a new one</Link></div>
          : <form onSubmit={save} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Input id="new-password" type={show ? "text" : "password"} required autoComplete="new-password" className="pr-11" value={pw} onChange={(e) => { setPw(e.target.value); setError(null); }} />
                  <button type="button" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow((v) => !v)} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">At least 6 characters.</p>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Save new password</Button>
            </form>}
        </CardContent>
      </Card>
    </main>
  );
}
