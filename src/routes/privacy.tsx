import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { privacy } from "@/content/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — RoleProve" },
      { name: "description", content: "What personal data RoleProve collects, why, who we share it with and your rights." },
      { property: "og:title", content: "Privacy Policy — RoleProve" },
      { property: "og:description", content: "What personal data RoleProve collects, why, who we share it with and your rights." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://roleprove.com/privacy" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://roleprove.com/privacy" }],
  }),
  component: () => <LegalPage doc={privacy} />,
});
