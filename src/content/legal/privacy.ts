// DRAFT — NOT LAWYER-REVIEWED. This wording needs professional legal review before wide launch.
// Edit freely. Text in [[PLACEHOLDER: ...]] must be filled in before launch.
import { p, list, type LegalDocument } from "./types";

export const privacy: LegalDocument = {
  title: "Privacy Policy",
  version: "2026-11-14",
  lastUpdated: "14 November 2026",
  intro: "This policy explains what personal data RoleProve collects, why, and the choices you have.",
  sections: [
    {
      id: "controller",
      heading: "1. Who is responsible",
      blocks: [
        p("[[PLACEHOLDER: legal entity name]] is the controller of your personal data."),
        p("Contact us at support@roleprove.com. Data protection contact: [[PLACEHOLDER: data protection contact]]."),
      ],
    },
    {
      id: "data-we-collect",
      heading: "2. What we collect and why",
      blocks: [
        {
          type: "table",
          head: ["Data", "What it includes", "Why we use it", "Legal basis"],
          rows: [
            ["Account", "Email, name, password (stored only as a secure hash), sign-in information", "Create and secure your account", "Contract"],
            ["Profile", "Headline, target role, credentials, links, uploaded certificates", "Show your profile and tailor simulations", "Contract"],
            ["Simulation data", "Answers, uploaded deliverables, scores, timing", "Run simulations, score them and give feedback", "Contract"],
            ["Interview prep", "Your answers, and your CV if you choose to upload one", "Generate and assess interview questions; tailor them to your CV", "Contract; explicit consent for CV use"],
            ["Video verification", "Camera, microphone and screen recordings of verified attempts. These are sensitive, biometric-type material.", "Verify that you took the attempt yourself", "Explicit consent"],
            ["Billing", "Stripe customer and subscription IDs, subscription status. We never see or store card numbers.", "Manage your subscription", "Contract; legal obligation (tax records)"],
            ["Support", "Messages, screenshots and any attempts you link", "Answer your questions and disputes", "Contract; legitimate interests"],
            ["Technical", "Logs, device and browser information, IP address, pages visited and errors", "Keep RoleProve secure and working, and understand how it is used", "Legitimate interests; consent for click measurement where required"],
          ],
        },
      ],
    },
    {
      id: "consent",
      heading: "3. Consent you can withdraw",
      blocks: [
        p("Video recordings and using your CV to tailor questions rely on your explicit consent. You can withdraw it at any time by not using these features and deleting the recordings or CV (deleting your data in Settings removes them). Withdrawing consent does not affect processing that happened before."),
      ],
    },
    {
      id: "ai",
      heading: "4. How we use AI",
      blocks: [
        p("To generate simulations and to score your work and give feedback, relevant content (such as job descriptions, your answers and your CV) is sent to our AI providers."),
        p("Work you upload during a simulation (spreadsheets, slide decks, documents and images) is sent to an AI provider for grading. Text we read from your files is kept only as long as the file itself. [[PLACEHOLDER: confirm provider data-use terms]]"),
        p("Whether providers may use this content to train their models: [[PLACEHOLDER: confirm provider's data-use terms]]."),
        p("Scores should never be the only basis for an employment decision. You can ask for a human review of any score through support."),
      ],
    },
    {
      id: "sharing",
      heading: "5. Who we share data with",
      blocks: [
        p("We use service providers (processors) who handle data on our behalf:"),
        list(
          "Hosting and database provider",
          "AI provider",
          "Stripe (payments)",
          "Email provider",
          "Lovable (website hosting and visitor analytics)",
          "[[PLACEHOLDER: any others]]",
        ),
        p("We do not sell personal data. Employers see nothing about you unless you choose to opt in to a future visibility feature."),
      ],
    },
    {
      id: "transfers",
      heading: "6. International transfers",
      blocks: [
        p("Some providers may process data outside your country, including outside the UK and EEA. Where this happens we rely on safeguards such as adequacy decisions or standard contractual clauses (including the UK International Data Transfer Addendum). [[PLACEHOLDER: confirm transfer safeguards per provider]]"),
      ],
    },
    {
      id: "retention",
      heading: "7. How long we keep data",
      blocks: [
        list(
          "Account, profile, simulation and interview prep data: until you delete it or your account.",
          "Video recordings: [[PLACEHOLDER: e.g. deleted after X days]], or sooner if you delete them.",
          "CVs: [[PLACEHOLDER: retention period]], or sooner if you delete them.",
          "Support tickets: [[PLACEHOLDER: retention period]].",
          "Billing records: as long as tax law requires.",
          "Technical logs: [[PLACEHOLDER: retention period]].",
        ),
        p("Deleting your account removes your profile, attempts, CVs, uploads, recordings and support tickets. We keep a record that you accepted these terms, and billing records where the law requires it."),
      ],
    },
    {
      id: "rights",
      heading: "8. Your rights",
      blocks: [
        p("You have the right to access, correct, delete and export your data, to restrict or object to processing, and to withdraw consent."),
        p("You can export or delete your data yourself in Settings, or contact support@roleprove.com. You can also complain to a data protection regulator. In the UK this is the Information Commissioner's Office (ico.org.uk)."),
      ],
    },
    {
      id: "security",
      heading: "9. Security",
      blocks: [
        p("We use access controls so each person can only reach their own data, private storage for uploads and recordings, secure connections, and hashed passwords. No system is perfectly secure, but we work to protect your data."),
      ],
    },
    {
      id: "children",
      heading: "10. Children",
      blocks: [p("RoleProve is not for anyone under 18.")],
    },
    {
      id: "changes",
      heading: "11. Changes to this policy",
      blocks: [p("If we make a material change, we will tell you in the app or by email and ask you to accept the new version.")],
    },
  ],
};
