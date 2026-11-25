import { createFileRoute } from "@tanstack/react-router";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { parseAuthSearch } from "@/lib/auth-entry";

const DESC = "Sign in to RoleProve or create a job seeker or employer account.";
export const Route = createFileRoute("/auth")({
  validateSearch: parseAuthSearch,
  head: () => ({
    meta: [
      { title: "Sign in or create an account | RoleProve" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Sign in or create an account | RoleProve" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthRoute,
});

function AuthRoute() {
  const search = Route.useSearch();
  // key: following a link to a different mode/choice (e.g. "Create an employer account") resets the panel.
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center px-4 py-10 sm:px-5">
      <AuthPanel key={`${search.mode ?? ""}-${search.as ?? ""}`} search={search} />
    </main>
  );
}
