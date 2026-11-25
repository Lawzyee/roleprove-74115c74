// DRAFT — NOT LAWYER-REVIEWED. This wording needs professional legal review before wide launch.
// Edit freely. Text in [[PLACEHOLDER: ...]] must be filled in before launch.
import { p, list, type LegalDocument } from "./types";

export const terms: LegalDocument = {
  title: "Terms of Service",
  version: "2026-11-14",
  lastUpdated: "14 November 2026",
  intro:
    "These terms explain the rules for using RoleProve. Please read them carefully. By creating an account you agree to them.",
  sections: [
    {
      id: "who-we-are",
      heading: "1. Who we are",
      blocks: [
        p("RoleProve is provided by [[PLACEHOLDER: legal entity name]], of [[PLACEHOLDER: registered address]], [[PLACEHOLDER: country]] (\"RoleProve\", \"we\", \"us\")."),
        p("You can contact us at support@roleprove.com."),
      ],
    },
    {
      id: "eligibility",
      heading: "2. Who can use RoleProve",
      blocks: [p("You must be 18 or over to create an account or use RoleProve.")],
    },
    {
      id: "accounts",
      heading: "3. Your account",
      blocks: [
        list(
          "Give accurate details when you sign up and keep them up to date.",
          "Keep your password secure and do not share your account. You are responsible for activity on your account.",
          "One account per person.",
        ),
      ],
    },
    {
      id: "what-roleprove-is",
      heading: "4. What RoleProve is",
      blocks: [
        p("RoleProve offers practice job simulations and interview preparation that produce scores and feedback."),
        p("The Job center links to external websites that RoleProve does not control. RoleProve does not verify employers or guarantee any role. [[PLACEHOLDER: confirm external listings wording]]"),
        p("Scores are practice-based indicators of how you performed on a task. They are not a guarantee of job performance, hiring outcomes or a formal qualification."),
      ],
    },
    {
      id: "acceptable-use",
      heading: "5. Acceptable use",
      blocks: [
        p("You must not:"),
        list(
          "cheat, or get someone else to complete a simulation or interview prep for you;",
          "share, copy, publish or resell simulation content, datasets, questions or answer keys;",
          "use bots, scripts or other automated means to access or scrape RoleProve;",
          "upload anything unlawful, or anyone else's confidential material without permission;",
          "impersonate another person or misrepresent who you are.",
        ),
        p("Verified (video-recorded) attempts must be taken by the account holder in person."),
      ],
    },
    {
      id: "your-content",
      heading: "6. Your content",
      blocks: [
        p("You keep ownership of what you upload, such as CVs, deliverables, certificates and recordings."),
        p("You give RoleProve a limited, non-exclusive licence to store and process that content only to provide the service to you, including AI processing to generate questions, scores and feedback. This licence ends when you delete the content or your account, except where we must keep something by law."),
        p("If you make your portfolio public, you are responsible for what you publish on it, including your bio, project insights and answers, and for not sharing confidential or employer information. [[PLACEHOLDER: confirm wording]]"),
      ],
    },
    {
      id: "ai-content",
      heading: "7. AI-generated content",
      blocks: [
        p("Simulations, feedback and scores are generated with the help of AI. They may contain mistakes."),
        p("If you think a score is wrong, use \"Dispute this score\" on the results page or contact us through the Help centre (/help). A person will review it."),
      ],
    },
    {
      id: "billing",
      heading: "8. Subscriptions and billing",
      blocks: [
        list(
          "The Practice/Prep plan costs $15 USD per month. Payments are processed by Stripe.",
          "Your subscription renews automatically each month until you cancel.",
          "You can cancel at any time from Manage billing in Settings. You keep access until the end of the period you have paid for.",
          "A free trial of [[PLACEHOLDER: trial length, currently 21 days]] is available once per person.",
          "During the launch period RoleProve is free. We will give you at least [[PLACEHOLDER: 30]] days' notice before we start charging.",
          "We do not give pro-rata refunds for part-used periods, except where the law requires it.",
        ),
      ],
    },
    {
      id: "recruiter-visibility",
      heading: "9. Recruiter visibility",
      blocks: [
        p("Showing profiles to employers is not available yet. If it becomes available, it will be opt-in and controlled by you. No profile will be shown to employers without your consent."),
      ],
    },
    {
      id: "termination",
      heading: "10. Ending your account",
      blocks: [
        p("You can delete your account at any time from Settings. Deleting your account cancels any subscription immediately."),
        p("We may suspend or close an account that breaks these terms. Where reasonable, we will tell you why first."),
      ],
    },
    {
      id: "employer-terms",
      heading: "10a. Employer Terms",
      blocks: [
        p("Approved companies may post external-link jobs through authorised owners and recruiters. Initial postings require review; established posting history may allow publication after safe-link checks. RoleProve may require review again, decline or unpublish a posting with a reason, or suspend a company. Jobs belong to the company rather than the author. Private practice text is removed on closure or expiry; retention of closed postings defaults to 12 months unless candidates track them. [[PLACEHOLDER: confirm wording and retention]]"),
        p("Companies may also accept applications through RoleProve. Company members may use what a candidate shares only to consider that application, must not copy it out of RoleProve in bulk, and lose access when the candidate withdraws, the company is suspended or deleted, or the retention period ends. Candidates apply free of charge. The employer decides about hiring, not RoleProve. [[PLACEHOLDER: confirm wording, retention and controller roles]]"),
        p("These terms apply when you submit a job listing or join the employer waitlist. [[PLACEHOLDER: Employer Terms wording]]"),
        p("By submitting a listing you confirm that you are authorised to post it for the company, that the job is genuine, lawful and non-discriminatory, and that candidates are never charged to apply. We review every listing and may decline or remove any listing at our discretion. Listings are shown as external listings and RoleProve does not verify employers. [[PLACEHOLDER: Employer Terms wording]]"),
      ],
    },
    {
      id: "liability",
      heading: "11. Disclaimers and limits of liability",
      blocks: [
        p("We work to keep RoleProve available and accurate, but we provide it \"as is\" and cannot promise it will always be uninterrupted or error-free."),
        p("We are not responsible for losses that were not reasonably foreseeable, or for decisions made by you or third parties based on your scores. Where the law allows, our total liability to you is limited to the amount you paid us in the 12 months before the claim."),
        p("Nothing in these terms limits or excludes liability that cannot legally be limited or excluded, such as liability for death or personal injury caused by negligence, for fraud, or your statutory rights as a consumer."),
      ],
    },
    {
      id: "changes",
      heading: "12. Changes to these terms",
      blocks: [
        p("We may update these terms. If a change is material, we will tell you by email or in the app and ask you to accept the new version before you continue using RoleProve."),
      ],
    },
    {
      id: "governing-law",
      heading: "13. Governing law",
      blocks: [p("These terms are governed by [[PLACEHOLDER: e.g. the laws of England and Wales]].")],
    },
  ],
};
