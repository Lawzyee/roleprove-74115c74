import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_BLURBS, CATEGORY_LABELS, PREP_CATEGORIES, toPillar } from "@/lib/interview-prep";
import { gradePrepAnswerFn } from "@/lib/interview-prep.functions";

export const Route = createFileRoute("/_authenticated/interview-prep/$sessionId")({
  head: () => ({
    meta: [
      { title: "Practise your answers | RoleProve" },
      { name: "description", content: "Practise written answers to your tailored interview questions and get AI feedback." },
      { property: "og:title", content: "Practise your answers | RoleProve" },
      { property: "og:description", content: "Written interview practice with structured, evidence-based feedback." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrepSessionPage,
});

type RubricScores = { evaluated?: boolean; structure?: number; specificity?: number; relevance?: number } | null;

function PrepSessionPage() {
  const { sessionId } = Route.useParams();

  const sessionQuery = useQuery({
    queryKey: ["prep-session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interview_prep_sessions")
        .select("id, title, created_at")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const questionsQuery = useQuery({
    queryKey: ["prep-questions", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interview_prep_questions")
        .select("id, category, question_text, order_index, interview_prep_responses(response_text, feedback_text, rubric_scores)")
        .eq("session_id", sessionId)
        .order("order_index");
      if (error) throw error;
      return data;
    },
  });

  const questions = questionsQuery.data ?? [];
  const grouped = PREP_CATEGORIES.map((cat) => ({
    cat: cat as string,
    items: questions.filter((q: any) => toPillar(q.category) === cat),
  })).filter((g) => g.items.length > 0);

  const storageKey = `prep-pillar-${sessionId}`;
  const [step, setStep] = useState(0);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (restored || grouped.length === 0) return;
    const saved = Number(window.localStorage.getItem(storageKey) ?? "0");
    if (Number.isFinite(saved) && saved > 0) setStep(Math.min(saved, grouped.length - 1));
    setRestored(true);
  }, [grouped.length, restored, storageKey]);

  useEffect(() => {
    if (restored) window.localStorage.setItem(storageKey, String(step));
  }, [step, restored, storageKey]);

  const current = grouped[Math.min(step, Math.max(grouped.length - 1, 0))];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10">
        <Link to="/interview-prep" className="text-sm font-medium text-primary">
          ← All prep sessions
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold">{sessionQuery.data?.title ?? "Interview prep"}</h1>
        <p className="mt-2 text-muted-foreground">
          Write an answer to each question and submit it for feedback. This is practice — it doesn&apos;t affect your
          verified skills score.
        </p>

        {questionsQuery.isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading your questions…</p>}

        {current && (
          <section className="mt-8">
            <div className="mb-4">
              <p className="text-sm font-medium text-primary">
                Pillar {step + 1} of {grouped.length}: {CATEGORY_LABELS[current.cat]}
              </p>
              <div className="mt-2 flex gap-1.5">
                {grouped.map((g, i) => (
                  <button
                    key={g.cat}
                    type="button"
                    aria-label={`Go to ${CATEGORY_LABELS[g.cat]}`}
                    onClick={() => setStep(i)}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i <= step ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            </div>

            <h2 className="font-display text-xl font-semibold">{CATEGORY_LABELS[current.cat]}</h2>
            <p className="mb-3 mt-1 text-sm text-muted-foreground">{CATEGORY_BLURBS[current.cat]}</p>
            <div className="space-y-4">
              {current.items.map((q: any, i: number) => (
                <QuestionCard
                  key={q.id}
                  index={i + 1}
                  id={q.id}
                  text={q.question_text}
                  existing={q.interview_prep_responses?.[0] ?? q.interview_prep_responses ?? null}
                />
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
                Back
              </Button>
              {step < grouped.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)}>Continue to next section</Button>
              ) : (
                <Button asChild variant="outline">
                  <Link to="/interview-prep">Finish practice</Link>
                </Button>
              )}
            </div>
          </section>
        )}
      </main>
    </>
  );
}


function QuestionCard({
  index,
  id,
  text,
  existing,
}: {
  index: number;
  id: string;
  text: string;
  existing: { response_text?: string; feedback_text?: string | null; rubric_scores?: RubricScores } | null;
}) {
  const [answer, setAnswer] = useState(existing?.response_text ?? "");
  const [feedback, setFeedback] = useState<string | null>(existing?.feedback_text ?? null);
  const [scores, setScores] = useState<RubricScores>(existing?.rubric_scores ?? null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (existing?.response_text !== undefined) setAnswer(existing.response_text ?? "");
    if (existing?.feedback_text !== undefined) setFeedback(existing.feedback_text ?? null);
    if (existing?.rubric_scores !== undefined) setScores(existing.rubric_scores ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.response_text, existing?.feedback_text]);

  async function submit() {
    setSubmitting(true);
    try {
      const result = await gradePrepAnswerFn({ data: { questionId: id, responseText: answer } });
      setFeedback(result.feedback_text);
      setScores(result.rubric_scores as RubricScores);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not get feedback right now");
    } finally {
      setSubmitting(false);
    }
  }

  const evaluated = !!scores?.evaluated;

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base">
          {index}. {text}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={6}
          value={answer}
          disabled={submitting}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Write your answer here…"
        />
        <div className="flex items-center justify-end">
          <Button size="sm" onClick={submit} disabled={submitting || !answer.trim()}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reviewing…
              </>
            ) : feedback ? (
              "Resubmit for feedback"
            ) : (
              "Get feedback"
            )}
          </Button>
        </div>

        {feedback && (
          <div className="space-y-2 rounded-xl bg-muted p-4">
            {evaluated ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Structure {scores?.structure}/5</Badge>
                <Badge variant="secondary">Specificity {scores?.specificity}/5</Badge>
                <Badge variant="secondary">Relevance {scores?.relevance}/5</Badge>
              </div>
            ) : (
              <Badge variant="outline">Not enough to evaluate</Badge>
            )}
            <p className="text-sm text-muted-foreground">{feedback}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
