import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { needsAnswer, onConsentChange, readChoice, saveChoices } from "@/lib/consent";

const OPEN_EVENT = "open-cookie-settings";
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [gpc, setGpc] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setGpc((navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true);
    void needsAnswer(["analytics"]).then((n) => n && setOpen(true));
    const onOpen = () => {
      setAnalytics(readChoice("analytics") === "granted");
      setSettings(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    const off = onConsentChange(() => setAnalytics(readChoice("analytics") === "granted"));
    return () => { window.removeEventListener(OPEN_EVENT, onOpen); off(); };
  }, []);

  useEffect(() => { if (open) panelRef.current?.focus(); }, [open, settings]);

  if (!open) return null;
  const close = () => { setOpen(false); setSettings(false); };

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label="Cookie preferences"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border border-border bg-card p-5 text-card-foreground shadow-lg outline-none sm:inset-x-auto sm:right-4"
    >
      {!settings ? (
        <>
          <p className="text-sm">
            We count visits without cookies. If you accept, we also measure clicks.{" "}
            <Link to="/cookies" className="text-primary underline">Cookie notice</Link> ·{" "}
            <Link to="/privacy" className="text-primary underline">Privacy</Link>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => { saveChoices({ analytics: "denied" }); close(); }}>Reject all</Button>
            <Button variant="outline" onClick={() => { saveChoices({ analytics: "granted" }); close(); }}>Accept all</Button>
          </div>
          <Button variant="link" className="mt-2 h-auto p-0 text-sm" onClick={() => { setAnalytics(readChoice("analytics") === "granted"); setSettings(true); }}>
            Cookie settings
          </Button>
        </>
      ) : (
        <>
          <p className="font-display text-base font-semibold">Cookie settings</p>
          {gpc && <p className="mt-2 text-sm text-muted-foreground">Your browser's privacy signal (Global Privacy Control) applies, so analytics stays off.</p>}
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">Necessary</p>
                <p className="text-muted-foreground">Keeps you signed in and remembers your choices. Always on.</p>
              </div>
              <span className="text-xs text-muted-foreground">Always on</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="consent-analytics" className="font-medium">Analytics, provided by Lovable</Label>
                <p className="text-muted-foreground">Measures clicks to help us improve RoleProve.</p>
              </div>
              <Switch id="consent-analytics" checked={!gpc && analytics} disabled={gpc} onCheckedChange={setAnalytics} />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button onClick={() => { saveChoices({ analytics: analytics && !gpc ? "granted" : "denied" }); close(); }}>Save choices</Button>
          </div>
        </>
      )}
    </div>
  );
}
