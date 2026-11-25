import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { employerTerms } from "@/content/legal";

export const Route = createFileRoute("/employer-terms")({
  head: () => ({
    meta: [
      { title: "Employer Terms — RoleProve" },
      { name: "description", content: "The terms for companies using a RoleProve employer account." },
      { property: "og:title", content: "Employer Terms — RoleProve" },
      { property: "og:description", content: "The terms for companies using a RoleProve employer account." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage doc={employerTerms} />,
});
