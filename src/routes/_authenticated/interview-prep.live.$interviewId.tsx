import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_LABELS } from "@/lib/interview-prep";
import { TIER_LABELS } from "@/lib/scoring-config";
import { endInterviewFn, postAnswerFn, skipQuestionFn } from "@/lib/live-interview.functions";
import type { InterviewScorecard, PlanQuestion } from "@/lib/live-interview";

export const Route = createFileRoute("/_authenticated/interview-prep/live/$interviewId")({
  head: () => ({
    meta: [
      { title: "Live mock interview | RoleProve" },
      { name: "description", content: "Practise a live text interview with an AI interviewer and get evidence-based feedback." },
      { property: "og:title", content: "Live mock interview | RoleProve" },
      { property: "og:description", content: "A live practice interview with follow-up questions and private practice feedback." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LiveInterviewPage,
});

type Message = {
  id: string;
  role: "interviewer" | "candidate" | "system";
  content: string;
  msg_type: string;
  pillar: string | null;
  question_index: number | null;
  created_at: string;
};

const ANSWER_LIMIT = 1500; // server enforces the configured value; keep in sync with app_settings.interview_answer_chars

function LiveInterviewPage() {
  const { interviewId } = Route.useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<"send" | "skip" | "end" | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const interviewQuery = useQuery({
    queryKey: ["live-interview", interviewId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_interviews")
        .select("id, title, status, length, plan, current_index, turn_count, scorecard")
        .eq("id", interviewId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Interview not found.");
      return data;
    },
  });

  const messagesQuery = useQuery({
    queryKey: ["live-interview-messages", interviewId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_interview_messages")
        .select("id, role, content, msg_type, pillar, question_index, created_at")
        .eq("interview_id", interviewId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  const interview = interviewQuery.data;
  const messages = messagesQuery.data ?? [];
  const plan = (interview?.plan ?? []) as unknown as PlanQuestion[];
  const active = interview?.status === "active";
  const currentPillar = plan[interview?.current_index ?? 0]?.pillar;
  const progressLabel = plan.length
    ? `Question ${Math.min((interview?.current_index ?? 0) + 1, plan.length)} of ${plan.length}`
    : "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["live-interview", interviewId] }),
      queryClient.invalidateQueries({ queryKey: ["live-interview-messages", interviewId] }),
    ]);
  }

  async function onSend() {
    const text = answer.trim();
    if (!text || busy) return;
    setBusy("send");
    try {
      const result = await postAnswerFn({ data: { interviewId, answer: text } });
      setAnswer("");
      if (result.outcome === "daily_limit" || result.outcome === "turn_limit") toast.info(result.message);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send that answer — please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onSkip() {
    if (busy) return;
    setBusy("skip");
    try {
      await skipQuestionFn({ data: { interviewId } });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not skip that question.");
    } finally {
      setBusy(null);
    }
  }

  async function onEnd() {
    if (busy) return;
    setBusy("end");
    try {
      await endInterviewFn({ data: { interviewId } });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not end the interview.");
    } finally {
      setBusy(null);
    }
  }

  if (interviewQuery.isLoading) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto flex max-w-3xl items-center gap-2 px-5 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your interview…
        </main>
      </>
    );
  }

  if (!interview) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-5 py-16">
          <p className="text-muted-foreground">Interview not found.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/interview-prep">Back to interview prep</Link>
          </Button>
        </main>
      </>
    );
  }

  const scorecard = interview.scorecard as unknown as InterviewScorecard | null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col px-5 pb-40 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-xl font-semibold">{interview.title ?? "Live mock interview"}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {active ? (
                <>
                  {progressLabel}
                  {currentPillar ? ` · ${CATEGORY_LABELS[currentPillar] ?? currentPillar}` : ""}
                </>
              ) : (
                "Interview finished"
              )}
            </p>
          </div>
          {active && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onSkip} disabled={busy !== null}>
                {busy === "skip" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Skip question
              </Button>
              <Button variant="ghost" size="sm" onClick={onEnd} disabled={busy !== null}>
                {busy === "end" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                End interview early
              </Button>
            </div>
          )}
        </div>

        {active && plan.length > 0 && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round(((interview.current_index + (messages.some((m) => m.role === "candidate" && m.question_index === interview.current_index) ? 1 : 0)) / plan.length) * 100)}%` }}
            />
          </div>
        )}

        <div className="mt-6 flex-1 space-y-4">
          {messages.map((m) =>
            m.role === "system" ? (
              <p key={m.id} className="rounded-xl bg-muted px-4 py-3 text-center text-xs text-muted-foreground">
                {m.content}
              </p>
            ) : (
              <div key={m.id} className={`flex ${m.role === "candidate" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "candidate" ? "bg-primary text-primary-foreground" : "border border-border bg-card"
                  }`}
                >
                  {m.role === "interviewer" && m.pillar && (m.msg_type === "main" || m.msg_type === "follow_up") && (
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {CATEGORY_LABELS[m.pillar] ?? m.pillar}
                      {m.msg_type === "follow_up" ? " · follow-up" : ""}
                    </p>
                  )}
                  {m.content}
                </div>
              </div>
            ),
          )}
          {busy === "send" && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> The interviewer is reading your answer…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {!active && scorecard && <ScorecardView scorecard={scorecard} />}
        {!active && !scorecard && (
          <Card className="mt-6 border-border shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Feedback couldn't be generated for this interview. You can start a new one from interview prep.
            </CardContent>
          </Card>
        )}
        {!active && (
          <div className="mt-6 flex gap-2">
            <Button onClick={() => router.navigate({ to: "/interview-prep" })}>Start another interview</Button>
            <Button asChild variant="outline">
              <Link to="/interview-prep">Back to interview prep</Link>
            </Button>
          </div>
        )}
      </main>

      {active && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-3xl px-5 py-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Textarea
                  rows={2}
                  value={answer}
                  maxLength={ANSWER_LIMIT}
                  disabled={busy !== null}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  placeholder="Type your answer… (Enter to send, Shift+Enter for a new line)"
                  className="resize-none"
                />
                <p className="mt-1 text-right text-[11px] text-muted-foreground">
                  {answer.length.toLocaleString()} / {ANSWER_LIMIT.toLocaleString()}
                </p>
              </div>
              <Button onClick={onSend} disabled={busy !== null || !answer.trim()} size="icon" aria-label="Send answer">
                {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ScorecardView({ scorecard }: { scorecard: InterviewScorecard }) {
  return (
    <section className="mt-8 space-y-4">
      <div>
        <Badge variant="secondary">Practice feedback</Badge>
        <h2 className="mt-2 font-display text-2xl font-semibold">Your feedback</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This is private practice feedback for you only. It is not a verified score, never appears on your
          Performance page, and is never shared with recruiters.
        </p>
      </div>

      {scorecard.summary && (
        <Card className="border-border shadow-none">
          <CardContent className="p-5 text-sm leading-relaxed">{scorecard.summary}</CardContent>
        </Card>
      )}

      {scorecard.pillars.map((p) => (
        <Card key={p.pillar} className="border-border shadow-none">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="font-display text-base">{CATEGORY_LABELS[p.pillar] ?? p.pillar}</CardTitle>
              {p.evaluated && p.score !== null ? (
                <Badge variant="outline">{p.score}%</Badge>
              ) : (
                <Badge variant="secondary">Cannot evaluate</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!p.evaluated && (
              <p className="text-muted-foreground">This area wasn't covered, so it's excluded rather than counted against you.</p>
            )}
            {p.criteria.length > 0 && (
              <ul className="space-y-2">
                {p.criteria.map((c, i) => (
                  <li key={i} className="rounded-lg bg-muted px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.label}</span>
                      <Badge variant="outline" className="text-[10px]">{TIER_LABELS[c.tier]}</Badge>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {c.rating === "cannot_evaluate" ? "Cannot evaluate" : c.rating === "yes" ? "Yes" : c.rating === "partial" ? "Partly" : "No"}
                      </span>
                    </div>
                    {c.evidence && <p className="mt-1 text-xs italic text-muted-foreground">“{c.evidence}”</p>}
                  </li>
                ))}
              </ul>
            )}
            {p.strength && (
              <p>
                <span className="font-medium">Strength:</span> {p.strength.text}
                {p.strength.quote && <span className="block text-xs italic text-muted-foreground">“{p.strength.quote}”</span>}
              </p>
            )}
            {p.improve && (
              <p>
                <span className="font-medium">To improve:</span> {p.improve.text}
                {p.improve.quote && <span className="block text-xs italic text-muted-foreground">“{p.improve.quote}”</span>}
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {scorecard.weakest.length > 0 && (
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">Stronger ways to answer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {scorecard.weakest.map((w, i) => (
              <div key={i}>
                <p className="font-medium">{w.question}</p>
                <p className="mt-1 whitespace-pre-line text-muted-foreground">{w.outline}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {scorecard.next_practice && (
        <Card className="border-border shadow-none">
          <CardContent className="p-5 text-sm">
            <span className="font-medium">Next practice:</span> {scorecard.next_practice}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
