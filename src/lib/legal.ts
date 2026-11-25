import { privacy, terms } from "@/content/legal";

export const CURRENT_TERMS_VERSION = terms.version;
export const CURRENT_PRIVACY_VERSION = privacy.version;

/** True when the latest stored acceptance doesn't match the current versions. */
export function needsReacceptance(latest: { terms_version: string; privacy_version: string } | null | undefined): boolean {
  if (!latest) return true;
  return latest.terms_version !== CURRENT_TERMS_VERSION || latest.privacy_version !== CURRENT_PRIVACY_VERSION;
}
export { employerTerms } from "@/content/legal";
import { employerTerms as _et } from "@/content/legal";
export const CURRENT_EMPLOYER_TERMS_VERSION = _et.version;
