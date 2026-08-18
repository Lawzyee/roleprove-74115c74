import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ClipboardList, LineChart, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RoleProve — Practice the job. Prove the skill." },
      {
        name: "description",
        content:
          "RoleProve is a skills gym for job seekers: complete realistic, hands-on job simulations and earn a verified skills score.",
      },
      { property: "og:title", content: "RoleProve — Practice the job. Prove the skill." },
      {
        property: "og:description",
        content: "Complete realistic job simulations and earn a verified, auditable skills score.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const steps = [
  {
    icon: Target,
    title: "Pick a role",
    body: "Choose the job you're aiming for — Data Analyst, SDR, Support, Engineering or Marketing.",
  },
  {
    icon: ClipboardList,
    title: "Complete a hands-on simulation",
    body: "Work through a real scenario: clean the data, write the query, brief the stakeholder. No trivia.",
  },
  {
    icon: LineChart,
    title: "Get a verified score",
    body: "Every task is graded against concrete, auditable rubric criteria with written feedback.",
  },
];

function Landing() {
  const { user, loading } = useAuth();
  const primaryTo = user ? "/dashboard" : "/auth";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <span className="font-display text-lg font-semibold tracking-tight">RoleProve</span>
          {!loading && (
            <Button asChild size="sm" variant={user ? "default" : "outline"}>
              <Link to={primaryTo}>{user ? "Go to dashboard" : "Sign in"}</Link>
            </Button>
          )}
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-5 py-24 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">The skills gym for job seekers</p>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Practice the job.
            <br />
            Prove the skill. Get the score.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Job listings ask for experience you can't get without a job. RoleProve breaks the loop: complete realistic
            simulations of real work and walk away with a score you can point to.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to={primaryTo}>{user ? "Go to dashboard" : "Create your free account"}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </section>

        <section id="how-it-works" className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-center font-display text-3xl font-semibold">How it works</h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {steps.map((step, i) => (
                <Card key={step.title} className="border-border shadow-none">
                  <CardHeader>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
                      <step.icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="font-display text-lg">
                      {i + 1}. {step.title}
                    </CardTitle>
                    <CardDescription className="text-base">{step.body}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="font-display text-3xl font-semibold">Scored on the work, not the wording</h2>
              <p className="mt-4 text-muted-foreground">
                Structured and multiple-choice tasks are rule-graded against the correct answer. Written answers are
                assessed against the same rubric a hiring manager would use — and you see the reasoning behind every
                point.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Concrete, auditable rubric criteria per task",
                  "Written feedback on every submission",
                  "Retake any simulation to raise your score",
                  "A composite score across every role you practise",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <Card className="border-border shadow-none">
              <CardHeader>
                <CardTitle className="font-display text-lg">Data Analyst — Q3 Subscription Revenue Review</CardTitle>
                <CardDescription>~35 min · 4 tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>1. Clean a messy revenue export and report the corrected figures.</p>
                <p>2. Write the SQL that answers the finance team's question.</p>
                <p>3. Interpret a churn chart and pick the defensible conclusion.</p>
                <p>4. Summarise it all for a non-technical stakeholder.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-3xl px-5 py-20 text-center">
            <h2 className="font-display text-3xl font-semibold">Start with your first simulation today</h2>
            <p className="mt-3 text-muted-foreground">
              Free to join. Pick a role, do the work, see where you stand.
            </p>
            <Button asChild size="lg" className="mt-8">
              <Link to={primaryTo}>{user ? "Go to dashboard" : "Get started"}</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted-foreground">
          © {new Date().getFullYear()} RoleProve. Practice the job. Prove the skill.
        </div>
      </footer>
    </div>
  );
}
