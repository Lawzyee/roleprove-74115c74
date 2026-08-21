import { useRef, useState } from "react";
import { Paperclip, Loader2, CheckCircle2, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { recordDeliverableFn } from "@/lib/deliverables.functions";

type Uploaded = { file_name: string; status: string; feedback: string | null };

export function DeliverableUpload({
  attemptId,
  taskId,
  label,
  hint,
  accept,
}: {
  attemptId: string;
  taskId: string;
  label: string;
  hint: string;
  accept: string[];
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<Uploaded[]>([]);

  async function onFile(file: File) {
    if (!user) return;
    setBusy(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${attemptId}/${taskId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("deliverables").upload(path, file);
      if (error) throw error;
      const record = (await recordDeliverableFn({
        data: { attemptId, taskId, filePath: path, fileName: safeName },
      })) as Uploaded;
      setUploaded((prev) => [...prev, record]);
      toast.success("Work sample uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload that file");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border p-4">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Paperclip className="mr-2 h-4 w-4" />}
        {busy ? "Uploading…" : "Choose file"}
      </Button>

      {uploaded.map((u, i) => (
        <div key={i} className="mt-3 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs">
          {u.status === "auto_checked" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div>
            <p className="font-medium">{u.file_name}</p>
            <p className="text-muted-foreground">{u.feedback}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
