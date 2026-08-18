import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/auth")({
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
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    target_role: "",
    location: "",
  });

  useEffect(() => {
    if (!loading && user) router.navigate({ to: "/dashboard" });
  }, [loading, user, router]);

  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "password" || key === "confirmPassword") setPasswordError(null);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && form.password !== form.confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              name: form.name,
              headline: form.target_role ? `Aspiring ${form.target_role}` : "",
              target_role: form.target_role,
              location: form.location,
            },
          },
        });
        if (error) throw error;
        toast.success("Account created. Welcome to RoleProve.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error) throw error;
        toast.success("Welcome back.");
      }
      router.navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
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
            {mode === "signup" ? "Create your account" : "Log in"}
          </CardTitle>
          <CardDescription>
            {mode === "signup"
              ? "Start practising real job tasks and build a score you can show."
              : "Pick up where you left off."}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                  <Label htmlFor="target_role">Target role / headline</Label>
                  <Input
                    id="target_role"
                    required
                    value={form.target_role}
                    onChange={(e) => update("target_role", e.target.value)}
                    placeholder="Data Analyst"
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
                  minLength={6}
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
                    minLength={6}
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signup" ? "Already have an account?" : "New to RoleProve?"}{" "}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            >
              {mode === "signup" ? "Log in" : "Create one"}
            </button>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
