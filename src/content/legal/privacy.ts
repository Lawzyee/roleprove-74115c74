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
        p("Live mock interview transcripts (your answers and the interviewer's messages) are sent to an AI provider to run the interview and produce your practice feedback. [[PLACEHOLDER: confirm provider data-use terms and retention]]"),
        p("Optional public portfolio: if you choose to make your portfolio public, anyone with its link can see your photo, display name, headline, bio and the projects, sections and scores you choose to show. It is private by default, is not listed in any directory, and is hidden from search engines unless you allow it. Making it private, removing a project or photo, or deleting your account removes it from view straight away. We do not record who views it. Your portfolio photo is stored with location and camera data removed. When the portfolio project insight is written with AI, your answers and feedback are sent to an AI provider. [[PLACEHOLDER: confirm wording and retention]]"),
        p("Reporting a portfolio: if you report a public portfolio without signing in, we keep the link name, the reason and details you give, your email address if you choose to give it, and a scrambled (keyed) form of your internet address used only to limit repeated reports. Only our support staff see reports; the portfolio owner is never told who reported it. Resolved reports are deleted after 90 days and unresolved reports after 12 months. [[PLACEHOLDER: confirm wording]]"),
        p("Whether providers may use this content to train their models: [[PLACEHOLDER: confirm provider's data-use terms]]."),
        p("Job center: we store saved jobs, application statuses, your private notes and job preferences until account deletion, and include them in your data export. Apply clicks are counted only in aggregate, without identifying the user. [[PLACEHOLDER: confirm wording and retention for job center data]]"),
        p("External job links: applications take place on the company's website. RoleProve does not pass your profile or other personal data to that website; the external site's own privacy terms apply. [[PLACEHOLDER: confirm third-party links wording]]"),
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
          "Database backups: deleted data can remain in automatic backups for [[PLACEHOLDER: backup retention period, e.g. up to 14 days]] until they expire.",
          "Our hosting platform's own logs and records: [[PLACEHOLDER: platform retention period]].",
          "Email delivery logs and the do-not-email list held by our email provider (your email address, which emails were sent, and whether you opted out): [[PLACEHOLDER: email provider retention period]].",
          "Content sent to our AI provider for question generation and grading (job ads, CV text, answers, uploaded files): [[PLACEHOLDER: AI provider retention period and data-use terms]].",
          "Invoices and payment records held by Stripe: [[PLACEHOLDER: Stripe retention period, e.g. as tax law requires, normally 6 years in the UK]].",
        ),
        p("Deleting your account removes your profile, attempts, answers, CVs, uploads, recordings, support tickets and your record of accepting our terms. We also cancel any subscription and delete your customer record at Stripe. If there is an unpaid invoice or open payment dispute, Stripe keeps that record with your name, email and account ID removed."),
        p("We keep one item after deletion: a scrambled (hashed) copy of your email address, used only to stop the same email from getting a second free trial. [[PLACEHOLDER: retention period for trial history]]"),
      ],
    },
    {
      id: "employers",
      heading: "7a. Employer waitlist and employer-submitted jobs",
      blocks: [
        p("If you join the employer waitlist we collect your name, work email, company, job title, company size, country, the roles and hiring types you're interested in, approximate hires per year, any message, when you consented and whether you confirmed your email. We use it only to contact you about RoleProve's employer features. Unconfirmed entries are deleted after 7 days; confirmed entries are kept until you remove them, or for at most 24 months. [[PLACEHOLDER: confirm wording and retention]]"),
        p("If you submit a job link we collect the job details, any job description you choose to share for practice exercises (stored privately and never shown in full to candidates), and your name and confirmed work email so our team can review the listing and email you the decision. Your contact details are visible only to our staff. Jobs not reviewed within 30 days, and rejected jobs after 90 days, are deleted with your contact details; for approved jobs your contact details are deleted 90 days after the job expires or is removed. [[PLACEHOLDER: confirm wording and retention]]"),
        p("To protect these forms from abuse we keep a scrambled (keyed hash) copy of your internet address for about a day. Waitlist and job submission details are not linked to RoleProve user accounts. Every waitlist email has a \"Remove me\" link and every listing email has a \"Remove this listing\" link; both work without signing in. You can also ask support@roleprove.com. [[PLACEHOLDER: confirm wording and retention]]"),
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
