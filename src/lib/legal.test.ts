import { describe, expect, it } from "vitest";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, needsReacceptance } from "./legal";

describe("legal re-acceptance", () => {
  it("asks users with no acceptance record", () => expect(needsReacceptance(null)).toBe(true));
  it("does not ask when both versions match", () =>
    expect(needsReacceptance({ terms_version: CURRENT_TERMS_VERSION, privacy_version: CURRENT_PRIVACY_VERSION })).toBe(false));
  it("asks when the terms version changed", () =>
    expect(needsReacceptance({ terms_version: "old", privacy_version: CURRENT_PRIVACY_VERSION })).toBe(true));
  it("asks when the privacy version changed", () =>
    expect(needsReacceptance({ terms_version: CURRENT_TERMS_VERSION, privacy_version: "old" })).toBe(true));
});
