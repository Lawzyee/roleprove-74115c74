import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/confirm")({
  head: () => ({ meta: [
    { title: "Confirm your email | RoleProve" },
    { name: "description", content: "Activate your RoleProve account and return to sign in." },
    { property: "og:title", content: "Confirm your email | RoleProve" },
    { property: "og:description", content: "Activate your RoleProve account and return to sign in." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ConfirmEmailPage,
});

function ConfirmEmailPage() {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function confirm() {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("error") || new URLSearchParams(url.hash.slice(1)).has("error")) throw new Error("Invalid link");
        // getSession waits for the client's implicit-link initialization.
        let { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        const code = url.searchParams.get("code");
        if (!session && code) {
          const result = await supabase.auth.exchangeCodeForSession(code);
          if (result.error) throw result.error;
          session = result.data.session;
        }
        const tokenHash = url.searchParams.get("token_hash");
        if (!session && tokenHash && url.searchParams.get("type") === "signup") {
          const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "signup" });
          if (result.error) throw result.error;
          session = result.data.session;
        }
        if (!session) throw new Error("Missing confirmation session");
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user?.email_confirmed_at) throw new Error("Email not confirmed");
        const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
        if (signOutError) throw signOutError;
        await router.navigate({ to: "/auth", search: { confirmed: true }, replace: true });
      } catch {
        setFailed(true);
      }
    }
    void confirm();
  }, [router]);
  return <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center gap-4 px-5 py-12">
    <h1 className="font-display text-2xl">{failed ? "We couldn't confirm your email" : "Confirming your email…"}</h1>
    {failed ? <>
      <p role="alert" className="text-sm text-muted-foreground">This link may have expired or already been used. Try signing in, or request another confirmation email.</p>
      <Link to="/auth" search={{ mode: "login", confirmationError: true }} className="text-sm text-primary hover:underline">Back to sign in</Link>
    </> : <Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" aria-label="Confirming email" />}
  </main>;
}