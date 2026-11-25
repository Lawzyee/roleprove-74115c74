// The sign-in / create-account panel used by the first screen (/) and /auth.
// Account type is never chosen here: candidates sign up through the auth client with no account_type,
// employers through employerSignUpFn; the database rule assign_account_type() decides the type.
import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Briefcase, Eye, EyeOff, Loader2, MailCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchAccountKind } from "@/hooks/useAccountKind";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Honeypot } from "@/components/employers/Fields";
import { listPublicRolesFn } from "@/lib/roles.functions";
import { employerSignUpFn } from "@/lib/employer-accounts.functions";
import { employerSignUpSchema } from "@/lib/employer-accounts";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal";
import { authErrorMessage, confirmationRedirect, CONFIRMATION_COOLDOWN_SECONDS, isDuplicateSignup, resendSecondsRemaining } from "@/lib/auth-flow";
import { homeFor, initialView, PLACEHOLDERS, type AuthSearch, type AuthView } from "@/lib/auth-entry";

type View = AuthView | "forgot";


function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, placeholder }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? "text" : "password"} required autoComplete={autoComplete} className="pr-11" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <button type="button" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow((v) => !v)}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

export function AuthPanel({ search }: { search: AuthSearch }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>(() => initialView(search));
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", email: "", password: "", target_role_id: "", company_name: "", job_title: "", terms: false });
  const [hp, setHp] = useState("");
  const headingId = useId();
  const signUpEmployer = useServerFn(employerSignUpFn);
  const roles = useQuery({ queryKey: ["roles-list"], queryFn: () => listPublicRolesFn(), enabled: view === "seeker" });

  // Signed in: send each account type to its own area.
  useEffect(() => {
    if (loading || !user || search.confirmed || running.current || sentTo) return;
    let cancelled = false;
    fetchAccountKind(user.id).then((kind) => { if (!cancelled) router.navigate({ to: homeFor(kind), replace: true }); });
    return () => { cancelled = true; };
  }, [loading, user, router, search.confirmed, sentTo]);

  useEffect(() => {
    const tick = () => setResendSeconds(resendSecondsRemaining(resendAt));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [resendAt]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((c) => ({ ...c, [k]: v })); setError(null); setNeedsConfirmation(false); setResendMessage(null); };
  const go = (v: View) => { setView(v); setError(null); setNeedsConfirmation(false); setResendMessage(null); };
  const cooldown = () => setResendAt(Date.now() + CONFIRMATION_COOLDOWN_SECONDS * 1000);

  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null); setResendMessage(null);
    try { await task(); } catch (e) { setError(authErrorMessage(e)); setNeedsConfirmation((e as { code?: string })?.code === "email_not_confirmed"); }
    finally { running.current = false; setBusy(false); }
  }

  const signIn = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
    if (err) throw err;
    const kind = await fetchAccountKind(data.user.id);
    toast.success("Welcome back.");
    await router.navigate({ to: homeFor(kind), replace: true });
  }); };

  const signUpSeeker = (e: React.FormEvent) => { e.preventDefault();
    if (!f.name.trim()) return setError("Enter your full name.");
    if (f.password.length < 6) return setError("Please choose a password with at least 6 characters.");
    if (!f.terms) return setError("Please confirm you are 18 or over and agree to the Terms and Privacy Policy.");
    void run(async () => {
      const email = f.email.trim();
      const { data, error: err } = await supabase.auth.signUp({ email, password: f.password, options: {
        emailRedirectTo: confirmationRedirect(window.location.origin),
        data: { name: f.name.trim(), target_role_id: f.target_role_id || null, terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION },
      } });
      if (err) throw err;
      if (isDuplicateSignup(data.user)) { setError("This email is already registered. Please sign in instead."); return; }
      if (data.session) await supabase.auth.signOut({ scope: "local" });
      setSentTo(email); setF((c) => ({ ...c, password: "" })); cooldown();
    });
  };

  const signUpHiring = (e: React.FormEvent) => { e.preventDefault();
    const p = employerSignUpSchema.safeParse({ name: f.name, email: f.email, password: f.password, company_name: f.company_name, job_title: f.job_title || undefined, terms: f.terms, website: hp });
    if (!p.success) return setError(p.error.issues[0]?.message ?? "Check the form.");
    void run(async () => {
      const r = await signUpEmployer({ data: p.data }).catch(() => ({ error: "Something went wrong. Please try again." }));
      if ("error" in r) { setError(r.error); return; }
      setSentTo(p.data.email); setF((c) => ({ ...c, password: "" })); cooldown();
    });
  };

  const forgot = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    const email = f.email.trim();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (err) throw err;
    setResetSentTo(email);
  }); };

  async function resend() {
    if (running.current || resendSecondsRemaining(resendAt) > 0) return;
    cooldown();
    await run(async () => {
      const { error: err } = await supabase.auth.resend({ type: "signup", email: sentTo ?? f.email.trim(), options: { emailRedirectTo: confirmationRedirect(window.location.origin) } });
      if (err) throw err;
      setResendMessage("Confirmation email sent. Please check your inbox and spam folder.");
    });
  }
  const resendButton = (
    <Button type="button" variant="outline" className="w-full" disabled={busy || resendSeconds > 0} onClick={resend}>
      {resendSeconds > 0 ? `Resend email in ${resendSeconds}s` : "Resend email"}
    </Button>
  );

  const status = <>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {needsConfirmation && resendButton}
    {resendMessage && <p role="status" className="text-sm text-primary">{resendMessage}</p>}
  </>;
  const submit = (label: string) => (
    <Button type="submit" className="w-full" disabled={busy}>
      {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      {busy ? "Please wait…" : label}
    </Button>
  );
  const switchLink = (to: View, label: string) => <Button type="button" variant="link" className="h-auto p-0 font-medium" onClick={() => go(to)}>{label}</Button>;

  const titles: Record<View, [string, string]> = {
    login: ["Sign in", "Welcome to RoleProve. Sign in to continue."],
    choose: ["Create an account", "How will you use RoleProve?"],
    seeker: ["Create your job seeker account", "Practise real job tasks and build a score you can show."],
    hiring: ["Create your employer account", "Use your work email. You'll set up your company after confirming it."],
    forgot: ["Reset your password", "We'll email you a link to choose a new password."],
  };
  const [title, description] = sentTo ? ["Check your email", "Activate your RoleProve account."] : resetSentTo ? ["Check your email", "Your reset link is on its way."] : titles[view];

  return (
    <Card className="border-border shadow-none">
      <CardHeader>
        <CardTitle id={headingId} className="font-display text-2xl"><h1>{title}</h1></CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {search.confirmed && <p role="status" className="mb-4 text-sm text-primary">Email confirmed. You can now sign in.</p>}
        {search.confirmationError && <p role="alert" className="mb-4 text-sm text-destructive">This confirmation link is invalid or has expired. Sign in to request a new one.</p>}

        {sentTo ? (
          <div className="space-y-4" aria-live="polite">
            <MailCheck className="h-8 w-8 text-primary" aria-hidden="true" />
            <p className="break-words text-sm">We've sent a confirmation link to <strong>{sentTo}</strong>. Click it to activate your account, then sign in.</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {resendMessage && <p role="status" className="text-sm text-primary">{resendMessage}</p>}
            {resendButton}
            <Button type="button" variant="link" className="w-full" onClick={() => { setSentTo(null); go("login"); }}>Back to sign in</Button>
          </div>
        ) : resetSentTo ? (
          <div className="space-y-4" aria-live="polite">
            <MailCheck className="h-8 w-8 text-primary" aria-hidden="true" />
            <p className="break-words text-sm">If an account exists for <strong>{resetSentTo}</strong>, we've sent a link to reset your password.</p>
            <Button type="button" variant="link" className="w-full" onClick={() => { setResetSentTo(null); go("login"); }}>Back to sign in</Button>
          </div>
        ) : view === "login" ? (
          <>
            <form onSubmit={signIn} className="space-y-4">
              <Field id="login-email" label="Email"><Input id="login-email" type="email" required autoComplete="email" value={f.email} placeholder={PLACEHOLDERS.email} onChange={(e) => set("email", e.target.value)} /></Field>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="login-password">Password</Label>
                  {switchLink("forgot", "Forgot password?")}
                </div>
                <PasswordInput id="login-password" value={f.password} onChange={(v) => set("password", v)} autoComplete="current-password" />
              </div>
              {status}
              {submit("Sign in")}
            </form>
            <div className="mt-6 space-y-3 border-t border-border pt-5 text-center text-sm">
              <p>New to RoleProve? {switchLink("choose", "Create an account")}</p>
              <p className="text-muted-foreground"><Link to="/about" className="underline hover:text-foreground">What is RoleProve?</Link> · <Link to="/employers" className="underline hover:text-foreground">For employers</Link></p>
            </div>
          </>
        ) : view === "forgot" ? (
          <form onSubmit={forgot} className="space-y-4">
            <Field id="forgot-email" label="Email"><Input id="forgot-email" type="email" required autoComplete="email" value={f.email} placeholder={PLACEHOLDERS.email} onChange={(e) => set("email", e.target.value)} /></Field>
            {status}
            {submit("Send reset link")}
            <p className="text-center text-sm">{switchLink("login", "Back to sign in")}</p>
          </form>
        ) : view === "choose" ? (
          <div className="space-y-3">
            <div role="group" aria-label="How will you use RoleProve?" className="grid gap-3">
              <button type="button" onClick={() => go("seeker")} className="flex items-start gap-3 rounded-lg border border-border p-4 text-left hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Search className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
                <span><span className="block font-medium">I'm a job seeker</span><span className="block text-sm text-muted-foreground">Practise real job tasks and apply to jobs.</span></span>
              </button>
              <button type="button" onClick={() => go("hiring")} className="flex items-start gap-3 rounded-lg border border-border p-4 text-left hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Briefcase className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
                <span><span className="block font-medium">I'm hiring (company or recruiter)</span><span className="block text-sm text-muted-foreground">Post jobs and review applications.</span></span>
              </button>
            </div>
            <p className="pt-2 text-center text-sm">Already have an account? {switchLink("login", "Sign in")}</p>
          </div>
        ) : view === "seeker" ? (
          <form onSubmit={signUpSeeker} className="space-y-4">
            <Field id="seeker-name" label="Full name"><Input id="seeker-name" required autoComplete="name" maxLength={180} value={f.name} placeholder={PLACEHOLDERS.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field id="seeker-email" label="Email"><Input id="seeker-email" type="email" required autoComplete="email" value={f.email} placeholder={PLACEHOLDERS.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field id="seeker-password" label="Password" hint="At least 6 characters."><PasswordInput id="seeker-password" value={f.password} onChange={(v) => set("password", v)} autoComplete="new-password" /></Field>
            <Field id="seeker-role" label="Target role (optional)">
              <Select value={f.target_role_id || undefined} onValueChange={(v) => set("target_role_id", v)}>
                <SelectTrigger id="seeker-role"><SelectValue placeholder="Choose a role" /></SelectTrigger>
                <SelectContent>{(roles.data ?? []).map((r: { id: string; name: string }) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="flex items-start gap-3">
              <Checkbox id="seeker-terms" checked={f.terms} onCheckedChange={(v) => set("terms", v === true)} className="mt-0.5" />
              <Label htmlFor="seeker-terms" className="text-sm font-normal leading-relaxed">I am 18 or over and I agree to the <Link to="/terms" target="_blank" rel="noopener" className="text-primary underline">Terms of Service</Link> and <Link to="/privacy" target="_blank" rel="noopener" className="text-primary underline">Privacy Policy</Link></Label>
            </div>
            {status}
            {submit("Create account")}
            <p className="text-center text-sm text-muted-foreground">Hiring instead? {switchLink("hiring", "Create an employer account")}</p>
            <p className="text-center text-sm">Already have an account? {switchLink("login", "Sign in")}</p>
          </form>
        ) : (
          <form onSubmit={signUpHiring} className="space-y-4">
            <Field id="hiring-name" label="Full name"><Input id="hiring-name" required autoComplete="name" maxLength={180} value={f.name} placeholder={PLACEHOLDERS.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field id="hiring-email" label="Work email" hint="Personal and temporary email addresses can't be used."><Input id="hiring-email" type="email" required autoComplete="email" aria-describedby="hiring-email-hint" value={f.email} placeholder={PLACEHOLDERS.workEmail} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field id="hiring-password" label="Password" hint="At least 8 characters."><PasswordInput id="hiring-password" value={f.password} onChange={(v) => set("password", v)} autoComplete="new-password" /></Field>
            <Field id="hiring-company" label="Company name"><Input id="hiring-company" required autoComplete="organization" maxLength={180} value={f.company_name} placeholder={PLACEHOLDERS.company} onChange={(e) => set("company_name", e.target.value)} /></Field>
            <Field id="hiring-title" label="Job title (optional)"><Input id="hiring-title" autoComplete="organization-title" maxLength={120} value={f.job_title} placeholder={PLACEHOLDERS.jobTitle} onChange={(e) => set("job_title", e.target.value)} /></Field>
            <div className="flex items-start gap-3">
              <Checkbox id="hiring-terms" checked={f.terms} onCheckedChange={(v) => set("terms", v === true)} className="mt-0.5" />
              <Label htmlFor="hiring-terms" className="text-sm font-normal leading-relaxed">I agree to the <Link to="/employer-terms" target="_blank" rel="noopener" className="text-primary underline">Employer Terms</Link> and <Link to="/privacy" target="_blank" rel="noopener" className="text-primary underline">Privacy Policy</Link></Label>
            </div>
            <Honeypot value={hp} onChange={setHp} />
            {status}
            {submit("Create employer account")}
            <p className="text-center text-sm text-muted-foreground">Looking for a job? {switchLink("seeker", "Create a job seeker account")}</p>
            <p className="text-center text-sm">Already have an account? {switchLink("login", "Sign in")}</p>
          </form>
        )}
        <p className="mt-5 text-center text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground">Terms</Link> · <Link to="/privacy" className="hover:text-foreground">Privacy</Link> · <Link to="/cookies" className="hover:text-foreground">Cookies</Link> · <Link to="/help" className="hover:text-foreground">Help</Link>
        </p>
      </CardContent>
    </Card>
  );
}
