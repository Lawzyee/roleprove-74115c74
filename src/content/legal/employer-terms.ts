// DRAFT — NOT LAWYER-REVIEWED. Text in [[PLACEHOLDER: ...]] must be filled in before launch.
import { p, list, type LegalDocument } from "./types";

export const employerTerms: LegalDocument = {
  title: "Employer Terms",
  version: "2026-11-25",
  lastUpdated: "25 November 2026",
  intro: "These terms apply to companies and their team members who use a RoleProve employer account.",
  sections: [
    { id: "wording", heading: "1. Employer Terms", blocks: [p("[[PLACEHOLDER: Employer Terms wording]]")] },
    {
      id: "review",
      heading: "2. How we review employers",
      blocks: [
        p("We review each company before it can use anything beyond its own profile. We check:"),
        list(
          "that the person signing up confirmed an email address at the company's own domain;",
          "that the company website belongs to that same domain and looks like a real business;",
          "the company registration number and public company page, if you give them.",
        ),
        p("\"Reviewed by RoleProve\" means our team carried out these checks. It does not guarantee that a company is reputable, solvent or that any job is genuine, and we may suspend a company at any time."),
      ],
    },
    { id: "contact", heading: "3. Contact", blocks: [p("Questions? Contact support@roleprove.com.")] },
  ],
};
