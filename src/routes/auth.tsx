import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authErrorMessage, confirmationRedirect, CONFIRMATION_COOLDOWN_SECONDS, isDuplicateSignup, resendSecondsRemaining } from "@/lib/auth-flow";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { confirmed?: boolean; confirmationError?: boolean; mode?: "login" } => ({
    confirmed: search.confirmed === true || search.confirmed === "true" ? true : undefined,
    confirmationError: search.confirmationError === true || search.confirmationError === "true" ? true : undefined,
    mode: search.mode === "login" ? "login" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Log in or sign up | RoleProve" },
      {
        name: "description",
        content: "Create your RoleProve account to practise real job tasks and earn a verified skills score.",
      },
      { property: "og:title", content: "Log in or sign up | RoleProve" },
      {
        property: "og:description",
        content: "Create your RoleProve account to practise real job tasks and earn a verified skills score.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const rolesQuery = useQuery({
    queryKey: ["roles-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("roles").select("id, name").order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const router = useRouter();
  const { user, loading } = useAuth();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"login" | "signup">(search.confirmed || search.confirmationError || search.mode === "login" ? "login" : "signup");
  const [submitting, setSubmitting] = useState(false);
  const requestRunning = useRef(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resending, setResending] = useState(false);
  const resendRunning = useRef(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    target_role_id: "",
    headline: "",
    location: "",
  });

  useEffect(() => {
    if (!loading && user && !search.confirmed && !requestRunning.current && !confirmationEmail) router.navigate({ to: "/dashboard" });
  }, [loading, user, router, search.confirmed, confirmationEmail]);

  useEffect(() => {
    const tick = () => setResendSeconds(resendSecondsRemaining(resendAvailableAt));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  function startCooldown() {
    setResendAvailableAt(Date.now() + CONFIRMATION_COOLDOWN_SECONDS * 1000);
    setResendSeconds(CONFIRMATION_COOLDOWN_SECONDS);
  }

  async function resendEmail() {
    if (resendRunning.current || resendSecondsRemaining(resendAvailableAt) > 0) return;
    resendRunning.current = true;
    setResending(true);
    setFormError(null);
    setResendMessage(null);
    startCooldown();
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: confirmationEmail ?? form.email.trim(),
        options: { emailRedirectTo: confirmationRedirect(window.location.origin) },
      });
      if (error) throw error;
      setResendMessage("Confirmation email sent. Please check your inbox and spam folder.");
    } catch (error) {
      setFormError(authErrorMessage(error));
    } finally {
      resendRunning.current = false;
      setResending(false);
    }
  }

  const resendControl = (
    <Button type="button" variant="outline" className="w-full" disabled={resending || resendSeconds > 0} onClick={resendEmail}>
      {resending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {resending ? "Sending…" : resendSeconds > 0 ? `Resend email in ${resendSeconds}s` : "Resend email"}
    </Button>
  );

  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFormError(null);
    setNeedsConfirmation(false);
    setResendMessage(null);
    if (key === "password" || key === "confirmPassword") setPasswordError(null);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (requestRunning.current) return;
    setFormError(null);
    setResendMessage(null);
    setNeedsConfirmation(false);
    if (mode === "signup" && form.password !== form.confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    if (mode === "signup" && form.password.length < 6) {
      setFormError("Please choose a stronger password with at least 6 characters.");
      return;
    }
    requestRunning.current = true;
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            emailRedirectTo: confirmationRedirect(window.location.origin),
            data: {
              name: form.name,
              headline: form.headline,
              target_role_id: form.target_role_id || null,
              location: form.location,
            },
          },
        });
        if (error) throw error;
        if (isDuplicateSignup(data.user)) {
          setFormError("This email is already registered. Please sign in instead.");
          return;
        }
        if (data.session) await supabase.auth.signOut({ scope: "local" });
        setConfirmationEmail(form.email.trim());
        setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
        startCooldown();
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        });
        if (error) throw error;
        toast.success("Welcome back.");
        router.navigate({ to: "/dashboard" });
      }
    } catch (err) {
      setFormError(authErrorMessage(err));
      setNeedsConfirmation((err as { code?: string })?.code === "email_not_confirmed");
    } finally {
      requestRunning.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-5 py-12">
      <Link to="/" className="mb-6 text-sm text-muted-foreground hover:text-foreground">
        ← Back to home
      </Link>
      <Card className="border-border shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-2xl">
            {confirmationEmail ? "Check your email" : mode === "signup" ? "Create your account" : "Log in"}
          </CardTitle>
          <CardDescription>
            {confirmationEmail ? "Activate your RoleProve account." : mode === "signup"
              ? "Start practising real job tasks and build a score you can show."
              : "Pick up where you left off."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {search.confirmed && <p role="status" className="mb-4 text-sm text-primary">Email confirmed. You can now sign in.</p>}
          {search.confirmationError && <p role="alert" className="mb-4 text-sm text-destructive">This confirmation link is invalid or has expired. Sign in to request a new one.</p>}
          {confirmationEmail ? (
            <div className="space-y-4" aria-live="polite">
              <MailCheck className="h-8 w-8 text-primary" aria-hidden="true" />
              <p className="break-words text-sm">We've sent a confirmation link to <strong>{confirmationEmail}</strong>. Click it to activate your account.</p>
              {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
              {resendMessage && <p role="status" className="text-sm text-primary">{resendMessage}</p>}
              {resendControl}
              <Link to="/auth" search={{ mode: "login" }} className="block text-center text-sm text-primary hover:underline" onClick={() => { setConfirmationEmail(null); setFormError(null); setResendMessage(null); setMode("login"); }}>Back to sign in</Link>
            </div>
          ) : <>
          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    required
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="Ada Okafor"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target_role_id">Target role</Label>
                  <Select
                    value={form.target_role_id || undefined}
                    onValueChange={(v) => update("target_role_id", v)}
                  >
                    <SelectTrigger id="target_role_id">
                      <SelectValue placeholder="Select your target role" />
                    </SelectTrigger>
                    <SelectContent>
                      {(rolesQuery.data ?? []).map((r: any) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="headline">Headline</Label>
                  <Input
                    id="headline"
                    value={form.headline}
                    onChange={(e) => update("headline", e.target.value)}
                    placeholder="e.g. Senior Marketing Manager moving into Data"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={form.location}
                    onChange={(e) => update("location", e.target.value)}
                    placeholder="Manchester, UK"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  className="pr-10"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  placeholder="At least 6 characters"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    required
                    className="pr-10"
                    aria-invalid={!!passwordError}
                    value={form.confirmPassword}
                    onChange={(e) => update("confirmPassword", e.target.value)}
                    placeholder="Re-enter your password"
                  />
                  <button
                    type="button"
                    aria-label={showConfirm ? "Hide password" : "Show password"}
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
              </div>
            )}
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            {needsConfirmation && resendControl}
            {resendMessage && <p role="status" className="text-sm text-primary">{resendMessage}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {submitting ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signup" ? "Already have an account?" : "New to RoleProve?"}{" "}
            <Button variant="link"
              type="button"
              disabled={submitting}
              className="h-auto p-0 font-medium"
              onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setFormError(null); setPasswordError(null); setNeedsConfirmation(false); setResendMessage(null); }}
            >
              {mode === "signup" ? "Log in" : "Create one"}
            </Button>
          </p>
          </>}
        </CardContent>
      </Card>
    </main>
  );
}
