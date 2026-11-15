import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, Globe, Lock, Plus, Trash2, Upload } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProjectCard, RoleFolder, VerifiedBadge } from "@/components/portfolio/PublicView";
import { ShareTools } from "@/components/portfolio/ShareTools";
import { PhotoCropper } from "@/components/portfolio/PhotoCropper";
import { BIO_MAX, PHOTO_MAX_BYTES, PHOTO_TYPES, slugProblem } from "@/lib/portfolio";
import {
  addProjectFn, deletePhotoFn, getMyPortfolioFn, removeProjectFn, savePortfolioFn, setSlugFn, setVisibilityFn, uploadPhotoFn,
} from "@/lib/portfolio.functions";

export const Route = createFileRoute("/_authenticated/portfolio/")({
  head: () => ({
    meta: [
      { title: "Your portfolio | RoleProve" },
      { name: "description", content: "Curate your completed simulation projects and share a public portfolio with recruiters." },
      { property: "og:title", content: "Your portfolio | RoleProve" },
      { property: "og:description", content: "Curate your completed simulation projects and share a public portfolio with recruiters." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortfolioPage,
});

type Form = {
  display_name: string; headline: string; bio: string; city: string; country: string;
  linkedin_url: string; github_url: string; credly_url: string; portfolio_url: string;
  show_linkedin: boolean; show_github: boolean; show_credly: boolean; show_other: boolean;
  show_scores: boolean; show_credentials: boolean; show_links: boolean; show_location: boolean; allow_indexing: boolean;
};

function PortfolioPage() {
  const qc = useQueryClient();
  const getMine = useServerFn(getMyPortfolioFn);
  const q = useQuery({ queryKey: ["my-portfolio"], queryFn: () => getMine() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-portfolio"] });
  const data = q.data;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">Portfolio</h1>
            <p className="text-muted-foreground">Curate your best projects and, if you choose, share them with a public link.</p>
          </div>
          <Button asChild variant="outline"><Link to="/portfolio/preview"><Eye className="mr-2 h-4 w-4" />Preview as visitor</Link></Button>
        </div>
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {q.error && <p className="text-sm text-destructive">Could not load your portfolio.</p>}
        {data && (
          <>
            <VisibilityPanel data={data} onChange={refresh} />
            <ProfileBlock data={data} onChange={refresh} />
            <Projects data={data} onChange={refresh} />
          </>
        )}
      </main>
    </div>
  );
}

type Data = Awaited<ReturnType<typeof getMyPortfolioFn>>;

function VisibilityPanel({ data, onChange }: { data: Data; onChange: () => void }) {
  const s = data.settings;
  const saveSlug = useServerFn(setSlugFn);
  const setVis = useServerFn(setVisibilityFn);
  const [slug, setSlug] = useState(s.slug ?? "");
  const [consentOpen, setConsentOpen] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const local = slug ? slugProblem(slug) : null;
  const url = s.slug ? `https://roleprove.com/p/${s.slug}` : null;

  async function submitSlug() {
    if (local) return toast.error(local);
    setBusy(true);
    const r = await saveSlug({ data: { slug } }).catch(() => ({ error: "Could not save your link name." }));
    setBusy(false);
    if ("error" in r && r.error) toast.error(r.error); else { toast.success("Link name saved."); onChange(); }
  }
  async function toggle(next: boolean, consent?: boolean) {
    if (next && !s.consented_at && !consent) { setConsentOpen(true); return; }
    setBusy(true);
    const r = await setVis({ data: { isPublic: next, consent } }).catch(() => ({ error: "Could not change visibility." }));
    setBusy(false);
    if ("error" in r && r.error) toast.error(r.error); else { toast.success(next ? "Your portfolio is public." : "Your portfolio is private."); setConsentOpen(false); onChange(); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{s.is_public ? <Globe className="h-5 w-5 text-primary" /> : <Lock className="h-5 w-5" />}Sharing and privacy</CardTitle>
        <CardDescription>Private by default. Only people you give the link to can see a public portfolio — there is no directory or search.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="slug">Your link</Label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">roleprove.com/p/</span>
            <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={30} className="w-56" placeholder="your-name" />
            <Button variant="outline" size="sm" onClick={submitSlug} disabled={busy || slug === (s.slug ?? "")}>Save link</Button>
          </div>
          {local && <p className="text-xs text-destructive">{local}</p>}
          {s.slug && slug !== s.slug && <p className="text-xs text-amber-700 dark:text-amber-400">Changing your link breaks any old links you’ve already shared.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
          <Switch id="public" checked={s.is_public} disabled={busy} onCheckedChange={(v) => toggle(v)} />
          <Label htmlFor="public" className="font-medium">{s.is_public ? "Portfolio is public" : "Make my portfolio public"}</Label>
          {s.is_public && url && (
            <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
              <a href={url.replace("https://roleprove.com", "")} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{url}</a>
            </div>
          )}
        </div>
        {s.is_public && url && s.slug && <ShareTools url={url} slug={s.slug} name={data.settings.display_name || data.profile?.name || ""} />}
      </CardContent>
      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Before you publish</DialogTitle><DialogDescription>Anyone with the link can see this. Don’t include confidential or employer information.</DialogDescription></DialogHeader>
          <p className="text-sm text-muted-foreground">See our <Link to="/privacy" target="_blank" className="text-primary underline">Privacy Policy</Link> for how your public portfolio is handled. You can make it private again at any time.</p>
          <label className="flex items-start gap-2 text-sm"><Checkbox checked={ticked} onCheckedChange={(v) => setTicked(v === true)} />I understand that anyone with the link can see my portfolio.</label>
          <DialogFooter><Button variant="outline" onClick={() => setConsentOpen(false)}>Cancel</Button><Button disabled={!ticked || busy} onClick={() => toggle(true, true)}>Publish</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ProfileBlock({ data, onChange }: { data: Data; onChange: () => void }) {
  const s = data.settings, p = data.profile;
  const save = useServerFn(savePortfolioFn);
  const upload = useServerFn(uploadPhotoFn);
  const delPhoto = useServerFn(deletePhotoFn);
  const fileInput = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const init = (): Form => ({
    display_name: s.display_name ?? p?.name ?? "", headline: p?.headline ?? "", bio: s.bio ?? "", city: s.city ?? "", country: s.country ?? "",
    linkedin_url: p?.linkedin_url ?? "", github_url: p?.github_url ?? "", credly_url: s.credly_url ?? "", portfolio_url: p?.portfolio_url ?? "",
    show_linkedin: s.show_linkedin, show_github: s.show_github, show_credly: s.show_credly, show_other: s.show_other,
    show_scores: s.show_scores, show_credentials: s.show_credentials, show_links: s.show_links, show_location: s.show_location, allow_indexing: s.allow_indexing,
  });
  const [f, setF] = useState<Form>(init);
  useEffect(() => { setF(init()); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  async function onSave() {
    setBusy(true);
    const r = await save({ data: f }).catch(() => ({ error: "Could not save." }));
    setBusy(false);
    if ("error" in r && r.error) toast.error(r.error); else { toast.success("Saved."); onChange(); }
  }
  function pick(file: File | undefined) {
    if (!file) return;
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return toast.error("Please choose a JPG, PNG or WebP photo.");
    if (file.size > PHOTO_MAX_BYTES) return toast.error("Photos must be 5 MB or smaller.");
    setCropFile(file);
  }
  const link = (k: "linkedin_url" | "github_url" | "credly_url" | "portfolio_url", show: "show_linkedin" | "show_github" | "show_credly" | "show_other", label: string) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between"><Label htmlFor={k}>{label}</Label><label className="flex items-center gap-1.5 text-xs text-muted-foreground"><Switch checked={f[show]} onCheckedChange={(v) => set(show, v)} />Show</label></div>
      <Input id={k} value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder="https://" maxLength={300} />
    </div>
  );
  const toggleRow = (k: "show_scores" | "show_credentials" | "show_links" | "show_location" | "allow_indexing", label: string, hint?: string) => (
    <label className="flex items-start justify-between gap-3 py-2">
      <span><span className="text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
      <Switch checked={f[k]} onCheckedChange={(v) => set(k, v)} />
    </label>
  );

  return (
    <Card>
      <CardHeader><CardTitle>Profile</CardTitle><CardDescription>What visitors see at the top of your portfolio. Your email and phone are never shown.</CardDescription></CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          {data.photo ? <img src={data.photo} alt="Your portfolio photo" className="h-20 w-20 rounded-full border border-border object-cover" /> : <span className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">No photo</span>}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={busy}><Upload className="mr-2 h-4 w-4" />{data.photo ? "Change photo" : "Upload photo"}</Button>
          {data.photo && <Button variant="ghost" size="sm" disabled={busy} onClick={async () => { const r = await delPhoto(); if ("error" in r && r.error) toast.error(r.error); else { toast.success("Photo removed."); onChange(); } }}>Remove photo</Button>}
          <span className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 5 MB. Location data is removed.</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="dn">Display name</Label><Input id="dn" value={f.display_name} onChange={(e) => set("display_name", e.target.value)} maxLength={80} /></div>
          <div className="space-y-1"><Label htmlFor="hl">Headline</Label><Input id="hl" value={f.headline} onChange={(e) => set("headline", e.target.value)} maxLength={160} /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="bio">Short bio</Label><Textarea id="bio" rows={4} value={f.bio} onChange={(e) => set("bio", e.target.value)} maxLength={BIO_MAX} /><p className="text-right text-xs text-muted-foreground">{f.bio.length}/{BIO_MAX}</p></div>
          <div className="space-y-1"><Label htmlFor="city">City (optional)</Label><Input id="city" value={f.city} onChange={(e) => set("city", e.target.value)} maxLength={80} /></div>
          <div className="space-y-1"><Label htmlFor="country">Country (optional)</Label><Input id="country" value={f.country} onChange={(e) => set("country", e.target.value)} maxLength={80} /></div>
          {link("linkedin_url", "show_linkedin", "LinkedIn")}
          {link("github_url", "show_github", "GitHub")}
          {link("credly_url", "show_credly", "Credly")}
          {link("portfolio_url", "show_other", "Other link")}
        </div>
        <div className="divide-y divide-border rounded-lg border border-border px-4">
          {toggleRow("show_scores", "Show scores", "Score badges and pillar bars on your projects.")}
          {toggleRow("show_credentials", "Show credentials", "With their status badges.")}
          {toggleRow("show_links", "Show links")}
          {toggleRow("show_location", "Show city and country")}
          {toggleRow("allow_indexing", "Allow search engines to find my portfolio", "Off: search engines are asked not to list it.")}
        </div>
        <Button onClick={onSave} disabled={busy}>Save profile</Button>
      </CardContent>
      <PhotoCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={async (b64) => {
        setCropFile(null); setBusy(true);
        const r = await upload({ data: { base64: b64 } }).catch(() => ({ error: "Could not upload the photo." }));
        setBusy(false);
        if ("error" in r && r.error) toast.error(r.error); else { toast.success("Photo updated."); onChange(); }
      }} />
    </Card>
  );
}

function Projects({ data, onChange }: { data: Data; onChange: () => void }) {
  const add = useServerFn(addProjectFn);
  const remove = useServerFn(removeProjectFn);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; title: string } | null>(null);
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-semibold">Projects</h2>
      {data.folders.length === 0 && <p className="text-sm text-muted-foreground">No projects yet. Add a completed simulation below.</p>}
      {data.folders.map((f) => (
        <RoleFolder key={f.key} name={f.name} count={f.projects.length}>
          {f.projects.map((p) => (
            <ProjectCard key={p.id} p={p} slug={data.settings.slug ?? ""} mode="owner"
              action={<Button size="sm" variant="ghost" onClick={() => setConfirm({ id: p.id, title: p.title })}><Trash2 className="mr-1 h-4 w-4" />Remove from portfolio</Button>} />
          ))}
        </RoleFolder>
      ))}
      <Card>
        <CardHeader><CardTitle className="text-base">Add project</CardTitle><CardDescription>Your completed, graded attempts that aren’t in your portfolio yet.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {data.available.length === 0 && <p className="text-sm text-muted-foreground">Nothing to add right now.</p>}
          {data.available.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
              <span className="font-medium">{a.title}</span><VerifiedBadge verified={a.verified} /><Badge variant="secondary">Score {a.score}</Badge>
              <span className="text-xs text-muted-foreground">{a.date ? new Date(a.date).toLocaleDateString("en-GB") : ""}</span>
              <Button size="sm" className="ml-auto" disabled={busyId === a.id} onClick={async () => {
                setBusyId(a.id);
                const r = await add({ data: { attemptId: a.id } }).catch(() => ({ error: "Could not add the project." }));
                setBusyId(null);
                if ("error" in r && r.error) return toast.error(r.error);
                toast.success("Added to your portfolio.");
                if ("insightError" in r && r.insightError) toast.message(`Insight not written yet: ${r.insightError}`);
                onChange();
              }}><Plus className="mr-1 h-4 w-4" />{busyId === a.id ? "Adding…" : "Add to portfolio"}</Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove “{confirm?.title}”?</AlertDialogTitle><AlertDialogDescription>The card and its public page will be removed. Your attempt and score are kept.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={async () => {
            if (!confirm) return;
            const r = await remove({ data: { projectId: confirm.id } }).catch(() => ({ error: "Could not remove." }));
            if ("error" in r && r.error) toast.error(r.error); else { toast.success("Removed from portfolio."); onChange(); }
            setConfirm(null);
          }}>Remove</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
