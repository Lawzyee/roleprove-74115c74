import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccountKind } from "@/hooks/useAccountKind";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, needsReacceptance } from "@/lib/legal";

/** Blocking one-time prompt when the terms or privacy version changes. */
export function TermsUpdatePrompt() {
  const { user } = useAuth();
  const kind = useAccountKind().data;
  const [show, setShow] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setShow(false); return; }
    let cancelled = false;
    supabase
      .from("legal_acceptances")
      .select("terms_version, privacy_version")
      .eq("user_id", user.id)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => { if (!cancelled && !error) setShow(needsReacceptance(data)); });
    return () => { cancelled = true; };
  }, [user]);

  // Employer accounts accept the Employer Terms at sign-up or invite instead.
  if (!show || !user || kind !== "candidate") return null;

  async function accept() {
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("legal_acceptances").insert({
      user_id: user!.id,
      terms_version: CURRENT_TERMS_VERSION,
      privacy_version: CURRENT_PRIVACY_VERSION,
      source: "update_prompt",
    });
    setSaving(false);
    if (error) setError("We couldn't save that. Please try again.");
    else setShow(false);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="terms-update-title" className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2 id="terms-update-title" className="font-display text-xl font-semibold">We've updated our terms</h2>
        <p className="mt-2 text-sm text-muted-foreground">Please review and accept the latest versions to keep using RoleProve.</p>
        <div className="mt-4 flex items-start gap-3">
          <Checkbox id="terms-update-agree" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
          <Label htmlFor="terms-update-agree" className="text-sm font-normal leading-relaxed">
            I am 18 or over and I agree to the{" "}
            <Link to="/terms" target="_blank" className="text-primary underline">Terms of Service</Link> and{" "}
            <Link to="/privacy" target="_blank" className="text-primary underline">Privacy Policy</Link>
          </Label>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <Button className="mt-5 w-full" disabled={!agreed || saving} onClick={accept}>
          {saving ? "Saving…" : "Accept and continue"}
        </Button>
      </div>
    </div>
  );
}
