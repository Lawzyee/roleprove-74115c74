// Shared shape for editable legal content files.
export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] };

export type LegalSection = { id: string; heading: string; blocks: LegalBlock[] };

export type LegalDocument = {
  title: string;
  /** Bump this when the wording changes materially; signed-in users are asked to accept again (terms/privacy only). */
  version: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
};

export const p = (text: string): LegalBlock => ({ type: "p", text });
export const list = (...items: string[]): LegalBlock => ({ type: "list", items });
