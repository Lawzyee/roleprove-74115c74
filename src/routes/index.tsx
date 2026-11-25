import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth/AuthPanel";

const DESC = "Sign in to RoleProve: practise real job tasks, earn a verified skills score, and hire with evidence.";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RoleProve — Sign in" },
      { name: "description", content: DESC },
      { property: "og:title", content: "RoleProve — Practice the job. Prove the skill." },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

// Signed out: the sign-in screen. Signed in: AuthPanel sends candidates to /dashboard and employers to /employer.
function Home() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center px-4 py-10 sm:px-5">
      <p className="mb-4 text-center font-display text-xl font-semibold tracking-tight">RoleProve</p>
      <AuthPanel search={{}} />
    </main>
  );
}
