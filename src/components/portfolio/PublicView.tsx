import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BadgeCheck, ChevronDown, ExternalLink, Folder, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PRACTICE_DISCLAIMER, VERIFIED_MEANING } from "@/lib/portfolio";
import { reportPortfolioFn } from "@/lib/portfolio.functions";
import type { PublicCard, PublicPortfolio, PublicProject } from "@/lib/portfolio.server";

export type Cta = { body: string; note: string | null; button: string };
type Mode = "public" | "preview";

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge className="gap-1"><BadgeCheck className="h-3 w-3" />Verified</Badge>
  ) : (
    <Badge variant="outline">Practice</Badge>
  );
}

export function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      {children}<ExternalLink className="h-3 w-3" />
    </a>
  );
}

function Avatar({ url, name, size = "h-24 w-24" }: { url: string | null; name: string; size?: string }) {
  return url ? (
    <img src={url} alt={`Photo of ${name}`} width={192} height={192} className={`${size} rounded-full border border-border object-cover`} />
  ) : (
    <span className={`${size} flex items-center justify-center rounded-full bg-primary/10 font-display text-3xl font-semibold text-primary`}>{name.charAt(0).toUpperCase()}</span>
  );
}

export function ProjectCard({ p, slug, mode, action }: { p: PublicCard; slug: string; mode: Mode | "owner"; action?: React.ReactNode }) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <VerifiedBadge verified={p.verified} />
          {p.score != null && <Badge variant="secondary">Score {p.score}</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">{fmt(p.date)}</span>
        </div>
        <h3 className="font-display text-base font-semibold leading-snug">{p.title}</h3>
        <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{p.insight || "No insight written yet."}</p>
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm" variant="outline">
            {mode === "public" ? (
              <Link to="/p/$slug/$projectId" params={{ slug, projectId: p.id }}>View project</Link>
            ) : mode === "preview" ? (
              <Link to="/portfolio/preview/$projectId" params={{ projectId: p.id }}>View project</Link>
            ) : (
              <Link to="/portfolio/$projectId" params={{ projectId: p.id }}>View project</Link>
            )}
          </Button>
          {action}
        </div>
      </CardContent>
    </Card>
  );
}

export function RoleFolder({ name, count, children, defaultOpen = true }: { name: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border border-border bg-card/50">
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <Folder className="h-5 w-5 text-primary" />
        <span className="font-display font-semibold">{name}</span>
        <Badge variant="secondary">{count} {count === 1 ? "project" : "projects"}</Badge>
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const STATUS: Record<string, string> = { self_reported: "Self-reported", pending_review: "Pending review", verified: "Verified" };

export function PortfolioView({ portfolio, mode, cta }: { portfolio: PublicPortfolio; mode: Mode; cta?: Cta }) {
  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      {mode === "public" && cta && <SignupBanner cta={cta} />}
      <section className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <Avatar url={portfolio.photoUrl} name={portfolio.name} />
        <div className="flex-1 space-y-2">
          <h1 className="font-display text-3xl font-semibold">{portfolio.name}</h1>
          {portfolio.headline && <p className="text-lg text-muted-foreground">{portfolio.headline}</p>}
          {portfolio.location && <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground sm:justify-start"><MapPin className="h-4 w-4" />{portfolio.location}</p>}
          {portfolio.bio && <p className="whitespace-pre-line text-sm leading-relaxed">{portfolio.bio}</p>}
          {portfolio.links.length > 0 && (
            <div className="flex flex-wrap justify-center gap-4 pt-1 sm:justify-start">
              {portfolio.links.map((l) => <ExtLink key={l.label} href={l.url}>{l.label}</ExtLink>)}
            </div>
          )}
        </div>
      </section>

      {portfolio.credentials.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-display text-lg font-semibold">Credentials</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {portfolio.credentials.map((c, i) => (
              <Card key={i}><CardContent className="space-y-1 p-4">
                <div className="flex items-center gap-2"><span className="font-medium">{c.title}</span><Badge variant={c.status === "verified" ? "default" : "outline"} className="ml-auto text-[11px]">{STATUS[c.status] ?? c.status}</Badge></div>
                <p className="text-sm text-muted-foreground">{c.issuer}{c.year ? ` · ${c.year}` : ""}</p>
                {c.url && <ExtLink href={c.url}>Verify</ExtLink>}
              </CardContent></Card>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 space-y-4">
        <h2 className="font-display text-lg font-semibold">Projects</h2>
        {portfolio.folders.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
        {portfolio.folders.map((f) => (
          <RoleFolder key={f.key} name={f.name} count={f.projects.length}>
            {f.projects.map((p) => <ProjectCard key={p.id} p={p} slug={portfolio.slug} mode={mode} />)}
          </RoleFolder>
        ))}
        <p className="text-xs text-muted-foreground">{PRACTICE_DISCLAIMER}</p>
      </section>

      {mode === "public" && cta && <SignupCard cta={cta} />}
      <PortfolioFooter slug={portfolio.slug} mode={mode} />
    </div>
  );
}

export function ProjectView({ project, mode, cta }: { project: PublicProject; mode: Mode; cta?: Cta }) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      {mode === "public" && cta && <SignupBanner cta={cta} />}
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-3">
        {mode === "public" ? <Link to="/p/$slug" params={{ slug: project.slug }}>← {project.ownerName}’s portfolio</Link> : <Link to="/portfolio/preview">← Back to preview</Link>}
      </Button>
      <ProjectBody project={project} />
      {mode === "public" && cta && <SignupCard cta={cta} />}
      <PortfolioFooter slug={project.slug} mode={mode} />
    </div>
  );
}

export function ProjectHeader({ project }: { project: PublicProject }) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{project.role}</Badge><VerifiedBadge verified={project.verified} /><span>{fmt(project.date)}</span>
      </div>
      <h1 className="font-display text-3xl font-semibold">{project.title}</h1>
      {project.scenario && <p className="whitespace-pre-line text-muted-foreground">{project.scenario}</p>}
      {project.score != null && (
        <Card><CardContent className="space-y-3 p-5">
          <div className="flex items-baseline gap-2"><span className="font-display text-3xl font-semibold text-primary">{project.score}</span><span className="text-sm text-muted-foreground">/ 100 overall</span></div>
          {(project.pillars ?? []).map((p) => (
            <div key={p.label} className="space-y-1"><div className="flex justify-between text-sm"><span>{p.label}</span><span>{p.score}</span></div><Progress value={p.score} /></div>
          ))}
        </CardContent></Card>
      )}
    </header>
  );
}

export function DataTables({ tables }: { tables: PublicProject["stages"][number]["tables"] }) {
  return (
    <>
      {tables.map((t) => {
        const cols = [...new Set(t.rows.flatMap((r) => Object.keys(r)))];
        return (
          <div key={t.name} className="overflow-x-auto rounded-md border border-border">
            <p className="border-b border-border bg-muted/50 px-3 py-1.5 text-xs font-medium">{t.name}</p>
            <table className="w-full text-xs"><thead><tr>{cols.map((c) => <th key={c} className="px-2 py-1 text-left font-medium">{c}</th>)}</tr></thead>
              <tbody>{t.rows.map((r, i) => <tr key={i} className="border-t border-border">{cols.map((c) => <td key={c} className="px-2 py-1">{r[c]}</td>)}</tr>)}</tbody></table>
          </div>
        );
      })}
    </>
  );
}

function ProjectBody({ project }: { project: PublicProject }) {
  return (
    <article className="space-y-8">
      <ProjectHeader project={project} />
      {project.insight && (
        <section><h2 className="mb-2 font-display text-lg font-semibold">How I approached it</h2><p className="whitespace-pre-line leading-relaxed">{project.insight}</p></section>
      )}
      {project.stages.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Approach, stage by stage</h2>
          {project.stages.map((s, i) => (
            <Card key={i}><CardContent className="space-y-3 p-5">
              <h3 className="font-semibold">Stage {i + 1}: {s.title}</h3>
              {s.summary && <p className="whitespace-pre-line text-sm text-muted-foreground">{s.summary}</p>}
              <DataTables tables={s.tables} />
              {s.replies.map((r, j) => (
                <div key={j} className="space-y-1"><p className="text-sm font-medium">{r.label}</p><p className="whitespace-pre-line rounded-md bg-muted/50 p-3 text-sm">{r.reply}</p></div>
              ))}
            </CardContent></Card>
          ))}
        </section>
      )}
      <div className="space-y-1 rounded-lg border border-border p-4 text-xs text-muted-foreground">
        <p>{PRACTICE_DISCLAIMER}</p>
        {project.verified && <p>{VERIFIED_MEANING}</p>}
      </div>
    </article>
  );
}

function useShowCta() {
  const { user, loading } = useAuth();
  return !loading && !user;
}

function SignupBanner({ cta }: { cta: Cta }) {
  const show = useShowCta();
  const [hidden, setHidden] = useState(true);
  useEffect(() => { setHidden(sessionStorage.getItem("rp-portfolio-banner") === "1"); }, []);
  if (!show || hidden) return null;
  return (
    <div className="mb-8 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
      <span className="flex-1">{cta.body}{cta.note ? ` ${cta.note}` : ""}</span>
      <Button asChild size="sm"><Link to="/auth">{cta.button}</Link></Button>
      <button type="button" aria-label="Dismiss" onClick={() => { sessionStorage.setItem("rp-portfolio-banner", "1"); setHidden(true); }} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
    </div>
  );
}

function SignupCard({ cta }: { cta: Cta }) {
  if (!useShowCta()) return null;
  return (
    <Card className="mt-12 border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="text-xs font-medium uppercase tracking-wide text-primary">RoleProve</span>
        <p className="max-w-md font-display text-xl font-semibold">{cta.body}</p>
        {cta.note && <p className="text-sm text-muted-foreground">{cta.note}</p>}
        <Button asChild><Link to="/auth">{cta.button}</Link></Button>
      </CardContent>
    </Card>
  );
}

function PortfolioFooter({ slug, mode }: { slug: string; mode: Mode }) {
  return (
    <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground">
      <span>Built with <Link to="/" className="font-medium text-primary hover:underline">RoleProve</Link></span>
      {mode === "public" && <ReportLink slug={slug} />}
    </footer>
  );
}

function ReportLink({ slug }: { slug: string }) {
  const { user } = useAuth();
  const report = useServerFn(reportPortfolioFn);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user) return <Link to="/auth" search={{ mode: "login" }} className="hover:underline">Sign in to report this portfolio</Link>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="hover:underline">Report this portfolio</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report this portfolio</DialogTitle><DialogDescription>Our support team will review it. Tell us what’s wrong.</DialogDescription></DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={4} placeholder="For example: offensive content, impersonation, confidential information…" />
          <DialogFooter>
            <Button disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                const r = await report({ data: { slug, reason } });
                if ("error" in r && r.error) toast.error(r.error); else { toast.success("Thanks — our team will review it."); setOpen(false); setReason(""); }
              } catch (e) { toast.error((e as Error).message.includes("10 characters") ? "Please describe the problem (at least 10 characters)." : "Could not send the report."); }
              finally { setBusy(false); }
            }}>Send report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NotFoundPortfolio() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="font-display text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">This page doesn’t exist or isn’t available.</p>
      <Button asChild variant="outline"><Link to="/">Go to RoleProve</Link></Button>
    </div>
  );
}
