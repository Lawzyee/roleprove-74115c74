import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth/AuthPanel";

const TITLE = "Sign in to RoleProve — Practice the job. Prove the skill.";
const DESC = "Sign in to RoleProve: practise real job tasks, earn a verified skills score, and hire with evidence.";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:url", content: "https://roleprove.com/" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://roleprove.com/" }],
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
