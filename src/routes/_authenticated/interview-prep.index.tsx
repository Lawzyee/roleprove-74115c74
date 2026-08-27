import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPrepSessionFn } from "@/lib/interview-prep.functions";

export const Route = createFileRoute("/_authenticated/interview-prep/")({
  head: () => ({
    meta: [
      { title: "Interview Prep | RoleProve" },
      {
        name: "description",
        content: "Paste a job description and get tailored interview questions with AI feedback on your written answers.",
      },
      { property: "og:title", content: "Interview Prep | RoleProve" },
      {
        property: "og:description",
        content: "Tailored interview questions and written-answer feedback for the specific job you're interviewing for.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InterviewPrepPage,
});

function InterviewPrepPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [tooVague, setTooVague] = useState<string | null>(null);

  const trimmed = value.trim();
  const isUrl = /^https?:\/\/\S+$/i.test(trimmed);

  const sessionsQuery = useQuery({
    queryKey: ["prep-sessions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interview_prep_sessions")
        .select("id, title, created_at, source_url")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function onGenerate() {
    if (!trimmed) return;
    setLoading(true);
    setTooVague(null);
    try {
      const result = await createPrepSessionFn({ data: isUrl ? { url: trimmed } : { text: trimmed } });
      if (result.outcome === "too_vague") {
        setTooVague(result.message);
      } else {
        router.navigate({ to: "/interview-prep/$sessionId", params: { sessionId: result.sessionId } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare questions for that posting");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">Interview prep</h1>
        <p className="mt-2 text-muted-foreground">
          Got an interview coming up? Paste that job description and we&apos;ll generate the questions you&apos;re most
          likely to be asked — then practise written answers and get feedback.
        </p>

        <Card className="mt-8 border-border shadow-none">
          <CardHeader className="pb-3">
            <Badge variant="secondary" className="w-fit gap-1.5">
              <MessagesSquare className="h-3.5 w-3.5" /> Tailored questions
            </Badge>
            <CardTitle className="font-display text-lg">Paste the job description</CardTitle>
            <CardDescription>Paste the full posting text, or a link to it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={7}
              value={value}
              disabled={loading}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste the job description here, or a link to the posting…"
            />

            {loading && (
              <div className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading the posting and writing your question set — this takes a few seconds.
              </div>
            )}

            {tooVague && <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{tooVague}</p>}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {isUrl ? "Looks like a link — we'll fetch the page text." : "Around 50+ words works best."}
              </p>
              <Button onClick={onGenerate} disabled={loading || !trimmed}>
                {loading ? "Generating…" : "Generate my questions"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold">Past prep sessions</h2>
          <Card className="border-border shadow-none">
            <CardContent className="divide-y divide-border p-0">
              {(sessionsQuery.data ?? []).length === 0 && (
                <p className="p-6 text-sm text-muted-foreground">
                  No prep sessions yet. Paste a job description above to create your first one.
                </p>
              )}
              {(sessionsQuery.data ?? []).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="font-medium">{s.title ?? "Interview prep"}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/interview-prep/$sessionId" params={{ sessionId: s.id }}>
                      Open
                    </Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </main>
    </>
  );
}
