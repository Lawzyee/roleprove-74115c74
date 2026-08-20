import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { generateJdSimulationFn } from "@/lib/jd.functions";

type NoMatch = { roleType: string };

export function JobDescriptionPaste({ onStartGeneric }: { onStartGeneric: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [noMatch, setNoMatch] = useState<NoMatch | null>(null);
  const [tooVague, setTooVague] = useState<string | null>(null);

  const trimmed = value.trim();
  const isUrl = /^https?:\/\/\S+$/i.test(trimmed);

  async function onGenerate() {
    if (!trimmed) return;
    setLoading(true);
    setNoMatch(null);
    setTooVague(null);
    try {
      const result = await generateJdSimulationFn({
        data: isUrl ? { url: trimmed } : { text: trimmed },
      });

      if (result.outcome === "too_vague") {
        setTooVague(result.message);
      } else if (result.outcome === "no_match") {
        setNoMatch({ roleType: result.roleType });
      } else {
        await queryClient.invalidateQueries({ queryKey: ["attempts"] });
        toast.success("Your tailored simulation is ready.");
        router.navigate({ to: "/simulate/$attemptId", params: { attemptId: result.attemptId } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not analyse that job description");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-border bg-card shadow-none">
      <CardHeader className="pb-3">
        <Badge variant="secondary" className="w-fit gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> Personalized
        </Badge>
        <CardTitle className="font-display text-lg">Paste a job description</CardTitle>
        <CardDescription>
          Paste the full posting text or a link to it, and we'll rebuild the simulation around that specific job.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={6}
          value={value}
          disabled={loading}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste the job description here, or a link to the posting…"
        />

        {loading && (
          <div className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading the posting and tailoring your tasks — this takes a few seconds.
          </div>
        )}

        {tooVague && <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{tooVague}</p>}

        {noMatch && (
          <div className="space-y-3 rounded-xl bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              We don't have a simulation for {noMatch.roleType} yet — try our generic Data Analyst simulation instead.
            </p>
            <Button size="sm" variant="outline" onClick={onStartGeneric}>
              Start the Data Analyst simulation
            </Button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {isUrl ? "Looks like a link — we'll fetch the page text." : "Around 50+ words works best."}
          </p>
          <Button onClick={onGenerate} disabled={loading || !trimmed}>
            {loading ? "Generating…" : "Generate my simulation"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
