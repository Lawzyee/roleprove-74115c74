import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmployerPreview } from "@/components/application/EmployerPreview";
import { getApplicationProfileFn } from "@/lib/application-profile.functions";
import { getApplyContextFn, submitApplicationFn } from "@/lib/applications.functions";
import { CONSENT_WORDING_VERSION, buildShareView, type ProfileSettings, type ShareSources } from "@/lib/application-profile";
import { APPLY_NOTICE, COVER_NOTE_MAX } from "@/lib/applications";

const TITLE = "Apply with RoleProve | RoleProve";
const DESC = "Review exactly what this employer will see, then send your application.";
export const Route = createFileRoute("/_authenticated/apply/$jobId")({
  head: () => ({ meta: [{ title: TITLE }, { name: "description", content: DESC }, { property: "og:title", content: TITLE }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: ApplyPage,
});

function Row({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 py-2"><Label htmlFor={id} className="font-normal">{label}</Label><Switch id={id} checked={checked} onCheckedChange={onChange} /></div>;
}

function ApplyPage() {
  const { jobId } = Route.useParams();
  const router = useRouter();
  const ctxFn = useServerFn(getApplyContextFn), profFn = useServerFn(getApplicationProfileFn), sendFn = useServerFn(submitApplicationFn);
  const ctx = useQuery({ queryKey: ["apply-context", jobId], queryFn: () => ctxFn({ data: { jobId } }) });
  const prof = useQuery({ queryKey: ["application-profile"], queryFn: () => profFn() });
  const [s, setS] = useState<ProfileSettings | null>(null);
  const [note, setNote] = useState(""); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { if (prof.data && !s) { const d = prof.data; const g = d.suggest; setS(d.saved ? (d.settings as ProfileSettings) : { ...(d.settings as ProfileSettings), display_name: g.display_name, headline: g.headline, bio: g.bio, city: g.city, country: g.country, linkedin_url: g.linkedin_url, github_url: g.github_url, other_url: g.other_url }); } }, [prof.data, s]);
  const view = useMemo(() => (s && prof.data ? buildShareView(s, prof.data.sources as unknown as ShareSources).view : null), [s, prof.data]);

  if (!ctx.data || !prof.data || !s || !view) return <><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-10 text-muted-foreground">Loading…</main></>;
  const c = ctx.data, src = prof.data.sources;
  const set = <K extends keyof ProfileSettings>(k: K, v: ProfileSettings[K]) => setS({ ...s, [k]: v });
  const toggleId = (k: "project_attempt_ids" | "credential_ids", id: string, on: boolean) => set(k, on ? [...s[k], id] : s[k].filter((x) => x !== id));
  const back = <Link to="/jobs/$jobId" params={{ jobId }} className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Back to the job</Link>;
  if (c.problem) return <><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-10">{back}<h1 className="mt-6 font-display text-3xl font-semibold">Apply with RoleProve</h1><p className="mt-4">{c.problem}</p>{c.existingId && <Button asChild className="mt-4"><Link to="/applications">My applications</Link></Button>}</main></>;

  async function send() {
    setBusy(true);
    try {
      const r = await sendFn({ data: { jobId, settings: s!, coverNote: note, consent } });
      if ("error" in r) { toast.error(r.error); return; }
      toast.success("Application sent.");
      await router.navigate({ to: "/applications" });
    } finally { setBusy(false); }
  }

  return <><SiteHeader /><main className="mx-auto max-w-5xl px-5 py-9">{back}
    <h1 className="mt-6 font-display text-3xl font-semibold">Apply with RoleProve</h1>
    <p className="mt-2 text-lg">{c.jobTitle} · <span className="text-muted-foreground">{c.companyName}</span></p>
    <p className="mt-3 text-sm text-muted-foreground">These choices start from your <Link to="/application-profile" className="text-primary underline">application profile</Link>. Changes here apply to this application only.</p>
    <div className="mt-8 grid gap-8 lg:grid-cols-2">
      <section aria-label="What to share" className="divide-y divide-border">
        <div className="pb-3"><h2 className="font-display text-xl font-semibold">What to share</h2><p className="text-sm text-muted-foreground">Your name is always shared.</p></div>
        <div className="py-3"><Row id="a-headline" label="Headline" checked={s.include_headline} onChange={(v) => set("include_headline", v)} /><Row id="a-bio" label="About me" checked={s.include_bio} onChange={(v) => set("include_bio", v)} /><Row id="a-score" label="Target role score" checked={s.include_target_score} onChange={(v) => set("include_target_score", v)} /><Row id="a-pillars" label="Skill breakdown on projects" checked={s.include_pillars} onChange={(v) => set("include_pillars", v)} /><Row id="a-links" label="Links" checked={s.include_links} onChange={(v) => set("include_links", v)} /><Row id="a-location" label="Location" checked={s.include_location} onChange={(v) => set("include_location", v)} /><Row id="a-work" label="Work preferences" checked={s.include_work} onChange={(v) => set("include_work", v)} /><Row id="a-photo" label="Photo" checked={s.include_photo} onChange={(v) => set("include_photo", v)} /><Row id="a-email" label="Let the employer email me directly" checked={s.contact_mode === "email"} onChange={(v) => set("contact_mode", v ? "email" : "inbox")} /></div>
        {src.projects.length > 0 && <fieldset className="py-3"><legend className="mb-2 font-medium">Projects</legend>{src.projects.map((p) => <label key={p.attemptId} className="flex items-center gap-2 py-1 text-sm"><Checkbox checked={s.project_attempt_ids.includes(p.attemptId)} onCheckedChange={(v) => toggleId("project_attempt_ids", p.attemptId, v === true)} />{p.title}</label>)}</fieldset>}
        {src.credentials.length > 0 && <fieldset className="py-3"><legend className="mb-2 font-medium">Credentials</legend>{src.credentials.map((x) => <label key={x.id} className="flex items-center gap-2 py-1 text-sm"><Checkbox checked={s.credential_ids.includes(x.id)} onCheckedChange={(v) => toggleId("credential_ids", x.id, v === true)} />{x.title}</label>)}</fieldset>}
        {src.cvs.length > 0 && <fieldset className="py-3"><legend className="mb-2 font-medium">CV</legend><label className="flex items-center gap-2 py-1 text-sm"><input type="radio" name="cv" checked={!s.cv_session_id} onChange={() => set("cv_session_id", null)} />No CV</label>{src.cvs.map((x) => <label key={x.sessionId} className="flex items-center gap-2 py-1 text-sm"><input type="radio" name="cv" checked={s.cv_session_id === x.sessionId} onChange={() => set("cv_session_id", x.sessionId)} />{x.fileName}</label>)}</fieldset>}
        <div className="py-3"><Label htmlFor="cover" className="font-medium">Cover note (optional)</Label><Textarea id="cover" className="mt-2" rows={5} maxLength={COVER_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{note.length}/{COVER_NOTE_MAX} · plain text</p></div>
      </section>
      <section aria-label="What the employer will see"><h2 className="mb-3 font-display text-xl font-semibold">What {c.companyName} will see</h2><EmployerPreview view={view} photo={s.include_photo ? prof.data.photo : null} />{note.trim() && <p className="mt-3 whitespace-pre-wrap rounded-lg border border-border p-4 text-sm">{note.trim()}</p>}</section>
    </div>
    <div className="mt-8 space-y-4 border-t border-border pt-6">
      <p className="text-sm">{APPLY_NOTICE}</p>
      <label className="flex items-start gap-3 text-sm"><Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" /><span>I agree to share the items shown above with {c.companyName} for my application to {c.jobTitle}. I can withdraw at any time, which removes their access. <span className="text-muted-foreground">(Consent wording version {CONSENT_WORDING_VERSION})</span></span></label>
      <Button disabled={!consent || busy} onClick={() => void send()}>{busy ? "Sending…" : "Send application"}</Button>
    </div>
  </main></>;
}
