import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function AttemptTypeBadge({ type }: { type?: string | null }) {
  const jd = type === "jd_matched";
  return (
    <Badge variant={jd ? "default" : "outline"} className="gap-1 text-[11px]">
      {jd && <Sparkles className="h-3 w-3" />}
      {jd ? "JD-matched" : "Generic"}
    </Badge>
  );
}
