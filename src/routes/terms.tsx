import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { terms } from "@/content/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — RoleProve" },
      { name: "description", content: "The rules for using RoleProve's job simulations, interview prep and subscription." },
      { property: "og:title", content: "Terms of Service — RoleProve" },
      { property: "og:description", content: "The rules for using RoleProve's job simulations, interview prep and subscription." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://roleprove.com/terms" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://roleprove.com/terms" }],
  }),
  component: () => <LegalPage doc={terms} />,
});
