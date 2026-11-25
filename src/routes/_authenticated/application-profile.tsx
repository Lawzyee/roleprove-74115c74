import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { VerifiedBadge } from "@/components/portfolio/PublicView";
import { EmployerPreview } from "@/components/application/EmployerPreview";
import { getApplicationProfileFn, saveApplicationProfileFn } from "@/lib/application-profile.functions";
import { PHOTO_NOTE, SCORE_WORDING, SHARE_EXPLAINER, type ProfileSettings, type ShareView } from "@/lib/application-profile";

export const Route = createFileRoute("/_authenticated/application-profile")({
  head: () => ({
    meta: [
      { title: "Application profile | RoleProve" },
      { name: "description", content: "Choose what employers may see when you apply to jobs through RoleProve." },
      { property: "og:title", content: "Application profile | RoleProve" },
      { property: "og:description", content: "Choose what employers may see when you apply to jobs through RoleProve." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApplicationProfilePage,
});

function Toggle({ id, label, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div><Label htmlFor={id}>{label}</Label>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ApplicationProfilePage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getApplicationProfileFn);
  const saveFn = useServerFn(saveApplicationProfileFn);
  const q = useQuery({ queryKey: ["application-profile"], queryFn: () => getFn() });
  const [s, setS] = useState<ProfileSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!q.data || s) return;
    const d = q.data;
    const base = d.settings as ProfileSettings;
    if (d.saved) return setS(base);
    const g = d.suggest;
    setS({ ...base, display_name: g.display_name, headline: g.headline, bio: g.bio, city: g.city, country: g.country, linkedin_url: g.linkedin_url, github_url: g.github_url, other_url: g.other_url });
  }, [q.data, s]);

  if (!q.data || !s) return (<><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-10 text-muted-foreground">Loading…</main></>);
  const d = q.data;
  const set = <K extends keyof ProfileSettings>(k: K, v: ProfileSettings[K]) => setS({ ...s, [k]: v });
  const toggleId = (k: "project_attempt_ids" | "credential_ids", id: string, on: boolean) => set(k, on ? [...s[k], id] : s[k].filter((x) => x !== id));

  async function save(thenPreview = false) {
    setBusy(true);
    try {
      const r = await saveFn({ data: s! });
      if ("error" in r) return toast.error(r.error);
      await qc.invalidateQueries({ queryKey: ["application-profile"] });
      toast.success("Saved");
      if (thenPreview) setPreviewOpen(true);
    } finally { setBusy(false); }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">Application profile</h1>
        <p className="mt-2 text-muted-foreground">What an employer may see when you apply. Prepare it once and reuse it.</p>
        <Card className="mt-6 border-primary/30 bg-primary/5 shadow-none">
          <CardContent className="space-y-1.5 pt-5 text-sm">{SHARE_EXPLAINER.map((l) => <p key={l}>{l}</p>)}</CardContent>
        </Card>

        <div className="mt-6 space-y-6">
          <Card className="border-border shadow-none">
            <CardHeader><CardTitle className="font-display text-lg">About you</CardTitle><CardDescription>Your name is always included. Text is shown as plain text.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div><Label htmlFor="name">Display name</Label><Input id="name" value={s.display_name ?? ""} placeholder={d.sources.fallbackName} maxLength={80} onChange={(e) => set("display_name", e.target.value)} /></div>
              <Toggle id="inc-headline" label="Include headline" checked={s.include_headline} onChange={(v) => set("include_headline", v)} />
              <Input aria-label="Headline" value={s.headline ?? ""} maxLength={160} onChange={(e) => set("headline", e.target.value)} />
              <Toggle id="inc-bio" label="Include short bio" checked={s.include_bio} onChange={(v) => set("include_bio", v)} />
              <Textarea aria-label="Short bio" value={s.bio ?? ""} maxLength={500} rows={3} onChange={(e) => set("bio", e.target.value)} />
              <Toggle id="inc-photo" label="Include photo" hint={d.sources.photoRef ? PHOTO_NOTE : `${PHOTO_NOTE} Uses your portfolio photo; you have none yet.`} checked={s.include_photo} onChange={(v) => set("include_photo", v)} />
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader><CardTitle className="font-display text-lg">Score and projects</CardTitle><CardDescription>{SCORE_WORDING} Scores come from your stored results and can't be edited.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Toggle id="inc-score" label={d.sources.target ? `Include ${d.sources.target.roleName} score (${d.sources.target.score}/100)` : "Include target role score"} hint={d.sources.target ? undefined : "Set a target role and complete a simulation for it to have a score."} checked={s.include_target_score} onChange={(v) => set("include_target_score", v)} />
              <Toggle id="inc-pillars" label="Show pillar bars on projects" hint="Only shown when the score is included." checked={s.include_pillars} onChange={(v) => set("include_pillars", v)} />
              <div className="space-y-2">
                <p className="text-sm font-medium">Projects (completed, graded attempts)</p>
                {d.sources.projects.length === 0 && <p className="text-sm text-muted-foreground">No graded attempts yet.</p>}
                {d.sources.projects.map((p) => (
                  <label key={p.attemptId} className="flex items-center gap-3 rounded-md border border-border p-2.5 text-sm">
                    <Checkbox checked={s.project_attempt_ids.includes(p.attemptId)} onCheckedChange={(v) => toggleId("project_attempt_ids", p.attemptId, !!v)} />
                    <span className="flex-1">{p.title}<span className="block text-xs text-muted-foreground">{p.role}{p.date ? ` · ${new Date(p.date).toLocaleDateString()}` : ""}</span></span>
                    <VerifiedBadge verified={p.verified} />
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader><CardTitle className="font-display text-lg">Credentials and CV</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {d.sources.credentials.length === 0 && <p className="text-sm text-muted-foreground">No credentials yet. <Link to="/profile" className="text-primary underline">Add them on your profile</Link>.</p>}
              {d.sources.credentials.map((c) => (
                <label key={c.id} className="flex items-center gap-3 text-sm">
                  <Checkbox checked={s.credential_ids.includes(c.id)} onCheckedChange={(v) => toggleId("credential_ids", c.id, !!v)} />
                  <span className="flex-1">{c.title} · {c.issuer}</span>
                  <Badge variant={c.status === "verified" ? "default" : "secondary"}>{c.status === "verified" ? "Verified" : c.status === "pending_review" ? "Pending review" : "Self-reported"}</Badge>
                </label>
              ))}
              <div>
                <p className="mb-2 text-sm font-medium">CV</p>
                {d.sources.cvs.length === 0 ? <p className="text-sm text-muted-foreground">No CV stored. CVs you upload in Interview prep appear here.</p> : (
                  <RadioGroup value={s.cv_session_id ?? "none"} onValueChange={(v) => set("cv_session_id", v === "none" ? null : v)}>
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="none" />Don't include a CV</label>
                    {d.sources.cvs.map((c) => <label key={c.sessionId} className="flex items-center gap-2 text-sm"><RadioGroupItem value={c.sessionId} />{c.fileName} <span className="text-xs text-muted-foreground">({new Date(c.createdAt).toLocaleDateString()})</span></label>)}
                  </RadioGroup>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader><CardTitle className="font-display text-lg">Links, location and work</CardTitle><CardDescription>Links must start with https:// or http://.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Toggle id="inc-links" label="Include links" checked={s.include_links} onChange={(v) => set("include_links", v)} />
              <div className="grid gap-2 sm:grid-cols-3">
                <Input aria-label="LinkedIn" placeholder="LinkedIn" value={s.linkedin_url ?? ""} onChange={(e) => set("linkedin_url", e.target.value)} />
                <Input aria-label="GitHub" placeholder="GitHub" value={s.github_url ?? ""} onChange={(e) => set("github_url", e.target.value)} />
                <Input aria-label="Other link" placeholder="Other" value={s.other_url ?? ""} onChange={(e) => set("other_url", e.target.value)} />
              </div>
              <Toggle id="inc-loc" label="Include city and country" checked={s.include_location} onChange={(v) => set("include_location", v)} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input aria-label="City" placeholder="City" maxLength={80} value={s.city ?? ""} onChange={(e) => set("city", e.target.value)} />
                <Input aria-label="Country" placeholder="Country" maxLength={80} value={s.country ?? ""} onChange={(e) => set("country", e.target.value)} />
              </div>
              <Toggle id="inc-work" label="Include work arrangement and availability" checked={s.include_work} onChange={(v) => set("include_work", v)} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input aria-label="Work arrangement" placeholder="e.g. Remote or hybrid" maxLength={120} value={s.work_arrangement ?? ""} onChange={(e) => set("work_arrangement", e.target.value)} />
                <Input aria-label="Availability" placeholder="e.g. Available from January" maxLength={120} value={s.availability ?? ""} onChange={(e) => set("availability", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader><CardTitle className="font-display text-lg">How employers contact you</CardTitle></CardHeader>
            <CardContent>
              <RadioGroup value={s.contact_mode} onValueChange={(v) => set("contact_mode", v as "inbox" | "email")}>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="inbox" />Reach me through RoleProve inbox only</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="email" />Share my email with employers I apply to</label>
              </RadioGroup>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">Never shared with employers: phone number, home address, date of birth, payment or billing details, support tickets, interview prep, interview transcripts, recordings, uploaded work files or dispute history.</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => save()} disabled={busy}>Save</Button>
            <Button variant="outline" onClick={() => save(true)} disabled={busy}><Eye className="mr-1.5 h-4 w-4" />Save and preview as an employer</Button>
          </div>
        </div>
      </main>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Preview as an employer</DialogTitle><DialogDescription>Exactly what would be shared, based on your saved choices.</DialogDescription></DialogHeader>
          <EmployerPreview view={d.preview as ShareView} photo={d.photo} />
        </DialogContent>
      </Dialog>
    </>
  );
}
