import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessagesSquare, Paperclip, X } from "lucide-react";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPrepSessionFn } from "@/lib/interview-prep.functions";
import { startLiveInterviewFn } from "@/lib/live-interview.functions";
import { LIVE_ROLES } from "@/lib/role-registry";
import { getStripeEnvironment } from '@/lib/stripe';

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
  const [cvFile, setCvFile] = useState<File | null>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);

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

  const liveQuery = useQuery({
    queryKey: ["live-interviews", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_interviews")
        .select("id, title, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [liveSource, setLiveSource] = useState("");
  const [liveLength, setLiveLength] = useState<"short" | "standard">("short");
  const [liveLoading, setLiveLoading] = useState(false);

  async function onStartLive() {
    if (!liveSource || liveLoading) return;
    setLiveLoading(true);
    try {
      const input = liveSource.startsWith("role:")
        ? { roleKey: liveSource.slice(5) as "data_analyst" | "customer_support" }
        : { prepSessionId: liveSource };
      const result = await startLiveInterviewFn({
        data: { ...input, length: liveLength, environment: getStripeEnvironment() },
      });
      if (result.outcome === "paywall") {
        router.navigate({ to: "/subscribe" });
      } else if (result.outcome === "daily_limit") {
        toast.info(result.message);
      } else {
        router.navigate({ to: "/interview-prep/live/$interviewId", params: { interviewId: result.interviewId } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the interview");
    } finally {
      setLiveLoading(false);
    }
  }

  async function uploadCv(): Promise<string | undefined> {
    if (!cvFile || !user) return undefined;
    const safeName = cvFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/interview-prep-cv/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("deliverables").upload(path, cvFile);
    if (error) throw error;
    return path;
  }

  async function onGenerate() {
    if (!trimmed) return;
    setLoading(true);
    setTooVague(null);
    try {
      const cvFilePath = await uploadCv();
      const result = await createPrepSessionFn({
        data: { ...(isUrl ? { url: trimmed } : { text: trimmed }), ...(cvFilePath ? { cvFilePath } : {}), environment: getStripeEnvironment() },
      });
      if (result.outcome === 'paywall') {
        router.navigate({ to: '/subscribe' });
      } else if (result.outcome === "too_vague") {
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

            <div className="rounded-xl border border-dashed border-border p-4">
              <p className="text-sm font-medium">Upload your CV (optional)</p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF or DOCX. We&apos;ll ground questions in your real experience and probe gaps against this job.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your CV is used only to tailor your questions, and you can delete it anytime in Settings.{" "}
                <a href="/privacy" target="_blank" rel="noopener" className="text-primary underline">Privacy Policy</a>
              </p>
              <input
                ref={cvInputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => cvInputRef.current?.click()}>
                  <Paperclip className="mr-2 h-4 w-4" />
                  {cvFile ? "Choose a different file" : "Choose file"}
                </Button>
                {cvFile && (
                  <span className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs">
                    {cvFile.name}
                    <button
                      type="button"
                      aria-label="Remove CV"
                      onClick={() => {
                        setCvFile(null);
                        if (cvInputRef.current) cvInputRef.current.value = "";
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
            </div>


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

        <Card className="mt-8 border-border shadow-none">
          <CardHeader className="pb-3">
            <Badge variant="secondary" className="w-fit gap-1.5">
              <MessagesSquare className="h-3.5 w-3.5" /> Live practice
            </Badge>
            <CardTitle className="font-display text-lg">Practice live interview</CardTitle>
            <CardDescription>
              A live text interview: one question at a time, follow-ups when answers are vague, and private
              practice feedback at the end.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium">What should it be based on?</p>
              <select
                value={liveSource}
                disabled={liveLoading}
                onChange={(e) => setLiveSource(e.target.value)}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Choose a prep session or a role…</option>
                {(sessionsQuery.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    Prep session: {s.title ?? "Interview prep"}
                  </option>
                ))}
                {LIVE_ROLES.map((r) => (
                  <option key={r.key} value={`role:${r.key}`}>
                    Fresh start: {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-sm font-medium">Length</p>
              <div className="mt-2 flex gap-2">
                {(
                  [
                    { value: "short", label: "Short — 5 questions" },
                    { value: "standard", label: "Standard — 8 questions" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    disabled={liveLoading}
                    onClick={() => setLiveLength(o.value)}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      liveLength === o.value ? "border-primary bg-primary/5 font-medium" : "border-border text-muted-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              Your answers are sent to an AI provider to run this interview. Read how we handle your data in the{" "}
              <a href="/privacy" target="_blank" rel="noopener" className="text-primary underline">
                Privacy Policy
              </a>
              . Starting counts as one interview prep use.
            </p>
            <div className="flex justify-end">
              <Button onClick={onStartLive} disabled={liveLoading || !liveSource}>
                {liveLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing your interview…
                  </>
                ) : (
                  "Start live interview"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {(liveQuery.data ?? []).length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 font-display text-xl font-semibold">Live interviews</h2>
            <Card className="border-border shadow-none">
              <CardContent className="divide-y divide-border p-0">
                {(liveQuery.data ?? []).map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="font-medium">{i.title ?? "Live mock interview"}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.status === "active" ? "In progress — resume anytime" : "Finished"} ·{" "}
                        {new Date(i.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/interview-prep/live/$interviewId" params={{ interviewId: i.id }}>
                        {i.status === "active" ? "Resume" : "Review"}
                      </Link>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

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
