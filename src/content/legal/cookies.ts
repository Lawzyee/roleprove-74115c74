// DRAFT — NOT LAWYER-REVIEWED. This wording needs professional legal review before wide launch.
import { p, type LegalDocument } from "./types";

export const cookies: LegalDocument = {
  title: "Cookie Notice",
  version: "2026-11-14",
  lastUpdated: "14 November 2026",
  intro: "This notice lists the cookies and browser storage RoleProve uses.",
  sections: [
    {
      id: "what-we-use",
      heading: "What we store in your browser",
      blocks: [
        {
          type: "table",
          head: ["Name", "Type", "Purpose", "Kept for"],
          rows: [
            ["Sign-in session", "Browser storage (essential)", "Keeps you signed in", "Until you sign out"],
            ["Interview prep position", "Browser storage (essential)", "Remembers which step of an interview prep session you were on", "Until cleared"],
            ["Your cookie choice", "Browser storage (essential)", "Remembers whether you accepted or rejected analytics", "Up to 12 months"],
            ["Stripe", "Cookies set by Stripe (essential)", "Fraud prevention during checkout and billing", "Set by Stripe"],
          ],
        },
      ],
    },
    {
      id: "analytics",
      heading: "Visitor analytics",
      blocks: [
        p("Our visitor analytics uses no cookies, stores nothing on your device, doesn't keep IP addresses and doesn't identify you. Lovable collects this data for us. Lovable's privacy policy (https://lovable.dev/privacy) explains how it handles it."),
        p("It records the pages visited, where visitors came from, their country, browser, operating system and device type, how long they stay, how fast pages load, errors, and clicks. Detailed data is kept for 90 days and daily summaries for a year."),
        p("Clicks are recorded only once you accept analytics. Page visits, time on page, page speed and errors are recorded for every visitor, without cookies and without identifying anyone."),
        p("Visitors in the EU/EEA, the UK, Switzerland and Canada are asked first: clicks are recorded only after they accept. For everyone else clicks are recorded unless they reject or their browser sends Global Privacy Control, which we always treat as a rejection. Your choice is saved in your browser for up to 12 months."),
        p("You can change your choice at any time with the Cookie settings link at the bottom of every page."),
      ],
    },
  ],
};
