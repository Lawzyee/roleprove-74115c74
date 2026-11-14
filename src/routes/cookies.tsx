import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { cookies } from "@/content/legal";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Notice — RoleProve" },
      { name: "description", content: "The cookies and browser storage RoleProve uses, and how to change your choice." },
      { property: "og:title", content: "Cookie Notice — RoleProve" },
      { property: "og:description", content: "The cookies and browser storage RoleProve uses, and how to change your choice." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://roleprove.com/cookies" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://roleprove.com/cookies" }],
  }),
  component: () => <LegalPage doc={cookies} />,
});
