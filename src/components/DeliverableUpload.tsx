import { useRef, useState } from "react";
import { Paperclip, Loader2, CheckCircle2, Clock3, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { recordDeliverableFn } from "@/lib/deliverables.functions";
import { TIER_LABELS } from "@/lib/scoring-config";

const CLIENT_MAX_MB = 10;

export type DeliverableRow = {
  id: string;
  task_id: string | null;
  file_name: string;
  grading_status: string;
  failure_reason?: string | null;
  criteria?: any[] | null;
  extraction_preview?: Record<string, any> | null;
};

/** Uploads a file to the user's private folder, then asks the server to validate and record it. */
export function useDeliverableUploader(attemptId: string, taskId: string, onDone: (r: { attemptCompleted: boolean }) => void) {
  const { user } = useAuth();
  const record = useServerFn(recordDeliverableFn);
  const [busy, setBusy] = useState(false);
  async function upload(file: File) {
    if (!user) return;
    if (file.size > CLIENT_MAX_MB * 1024 * 1024) {
      toast.error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${CLIENT_MAX_MB} MB.`);
      return;
    }
    setBusy(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${attemptId}/${taskId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("deliverables").upload(path, file);
      if (error) throw error;
      const result = await record({ data: { attemptId, taskId, filePath: path, fileName: safeName } });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success("File uploaded");
      onDone({ attemptCompleted: result.record.attemptCompleted });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload that file");
    } finally {
      setBusy(false);
    }
  }
  return { busy, upload };
}

export function FilePickButton({ accept, busy, onFile, label }: { accept: string[]; busy: boolean; onFile: (f: File) => void; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
        {busy ? "Uploading…" : label}
      </Button>
    </>
  );
}

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  legacy: { label: "Submitted — not graded yet", variant: "outline" },
  submitted: { label: "Submitted", variant: "outline" },
  grading: { label: "Grading…", variant: "secondary" },
  graded: { label: "Graded", variant: "default" },
  unreadable: { label: "Could not read this file", variant: "destructive" },
};

function previewText(p: Record<string, any> | null | undefined) {
  if (!p) return null;
  if (p.image) return `Image received (${p.sizeKb} KB).`;
  if (p.sheets) return (p.sheets as any[]).map((s) => `Sheet "${s.name}": ${s.rows} rows × ${s.columns} columns (${(s.headers ?? []).join(", ")})`).join(" · ");
  if (p.slideCount) return `${p.slideCount} slides${p.slidesWithCharts?.length ? `, charts on slide ${p.slidesWithCharts.join(", ")}` : ""}. Slide 1: "${p.firstSlide}"`;
  if (p.pageCount) return `${p.pageCount} pages. Page 1: "${p.firstPage}"`;
  if (p.paragraphs) return `${p.paragraphs} paragraphs. Start: "${p.firstPage}"`;
  return null;
}

export function DeliverableResult({ d, children }: { d: DeliverableRow; children?: React.ReactNode }) {
  const s = STATUS[d.grading_status] ?? STATUS.submitted!;
  const Icon = d.grading_status === "graded" ? CheckCircle2 : d.grading_status === "unreadable" ? AlertTriangle : d.grading_status === "grading" ? Loader2 : Clock3;
  const preview = previewText(d.extraction_preview);
  return (
    <div className="rounded-xl border border-border bg-muted/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className={`h-4 w-4 ${d.grading_status === "grading" ? "animate-spin" : ""} ${d.grading_status === "unreadable" ? "text-destructive" : "text-primary"}`} />
        <span className="text-sm font-medium">{d.file_name}</span>
        <Badge variant={s.variant}>{s.label}</Badge>
      </div>
      {d.failure_reason && <p className="mt-1 text-xs text-muted-foreground">{d.failure_reason}</p>}
      {preview && (
        <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">What we read: </span>{preview}</p>
      )}
      {(d.criteria ?? []).length > 0 && (
        <div className="mt-2 space-y-2">
          {(d.criteria as any[]).map((c, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs font-medium">{c.label}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{TIER_LABELS[c.tier as "must_have" | "good_to_have"] ?? c.tier}</Badge>
                  <span className="font-display text-xs font-semibold">{c.cannot_evaluate ? "Cannot evaluate" : `${Math.round(c.score * 10) / 10} / ${c.max}`}</span>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{c.justification}</p>
            </div>
          ))}
        </div>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Upload box shown inside a simulation stage. Files are graded after the attempt is submitted. */
export function DeliverableUpload({ attemptId, taskId, label, accept }: { attemptId: string; taskId: string; label: string; hint?: string; accept: string[] }) {
  const [name, setName] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const { busy, upload } = useDeliverableUploader(attemptId, taskId, () => pending && setName(pending.name));
  return (
    <div className="rounded-xl border border-dashed border-border p-4">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {accept.join(", ").replace(/\./g, "").toUpperCase()}, up to {CLIENT_MAX_MB} MB. Graded after you submit and adds evidence to your score; skipping it never lowers your score. A new upload replaces the previous one.
      </p>
      <div className="mt-3">
        <FilePickButton accept={accept} busy={busy} label={name ? "Replace file" : "Choose file"} onFile={(f) => { setPending(f); void upload(f); }} />
      </div>
      {name && <p className="mt-2 text-xs text-muted-foreground"><CheckCircle2 className="mr-1 inline h-3 w-3 text-primary" />{name} — will be graded when you submit.</p>}
    </div>
  );
}
