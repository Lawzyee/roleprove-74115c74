import { FileText, Mail, MapPin, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { VerifiedBadge } from "@/components/portfolio/PublicView";
import type { ShareView } from "@/lib/application-profile";

const STATUS: Record<string, string> = { self_reported: "Self-reported", pending_review: "Pending review", verified: "Verified" };

/** Exactly what would be shared: renders only the fields present in the share view. */
export function EmployerPreview({ view, photo }: { view: ShareView; photo: string | null }) {
  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-5 text-sm">
      <div className="flex items-center gap-4">
        {photo && <img src={photo} alt="" className="h-16 w-16 rounded-full object-cover" />}
        <div>
          <p className="font-display text-xl font-semibold">{view.name}</p>
          {view.headline && <p className="text-muted-foreground">{view.headline}</p>}
          {view.location && <p className="mt-1 flex items-center gap-1 text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{view.location}</p>}
        </div>
      </div>
      {view.bio && <p className="whitespace-pre-line">{view.bio}</p>}
      {view.target && (
        <div className="rounded-md bg-muted p-3">
          <p className="font-medium">{view.target.roleName}: <span className="text-primary">{view.target.score}/100</span> <Badge variant="outline" className="ml-1">{view.target.basis === "verified" ? "JD-matched" : "Practice"}</Badge></p>
          <p className="mt-1 text-xs text-muted-foreground">{view.target.wording}</p>
        </div>
      )}
      {view.work && <p className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{[view.work.arrangement, view.work.availability].filter(Boolean).join(" · ")}</p>}
      {view.projects && (
        <section><h3 className="mb-2 font-medium">Projects</h3><ul className="space-y-2">
          {view.projects.map((p) => (
            <li key={p.attemptId} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{p.title}</span><VerifiedBadge verified={p.verified} />{p.score != null && <span className="text-muted-foreground">{p.score}/100</span>}</div>
              <p className="text-xs text-muted-foreground">{p.role}{p.date ? ` · ${new Date(p.date).toLocaleDateString()}` : ""}</p>
              {p.pillars?.map((x) => (
                <div key={x.label} className="mt-1.5"><div className="flex justify-between text-xs"><span>{x.label}</span><span>{x.score}</span></div><div className="h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${x.score}%` }} /></div></div>
              ))}
            </li>
          ))}
        </ul></section>
      )}
      {view.credentials && (
        <section><h3 className="mb-2 font-medium">Credentials</h3><ul className="space-y-1">
          {view.credentials.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-2">{c.title} · {c.issuer}{c.year ? ` (${c.year})` : ""}<Badge variant={c.status === "verified" ? "default" : "secondary"}>{STATUS[c.status] ?? "Self-reported"}</Badge></li>)}
        </ul></section>
      )}
      {view.cv && <p className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />CV: {view.cv.fileName}</p>}
      {view.links && <p className="flex flex-wrap gap-3">{view.links.map((l) => <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">{l.label}</a>)}</p>}
      <p className="flex items-center gap-1 text-muted-foreground"><Mail className="h-3.5 w-3.5" />{view.contact.mode === "email" ? view.contact.email : "Contact through the RoleProve inbox only"}</p>
    </div>
  );
}
