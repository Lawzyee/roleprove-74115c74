import { describe, expect, it } from "vitest";
import { CONFIRMATION_COOLDOWN_SECONDS, resendSecondsRemaining, isDuplicateSignup, confirmationRedirect } from "./auth-flow";

describe("signup confirmation rules", () => {
  it("blocks resending for 60 seconds", () => {
    const start = 1000;
    const availableAt = start + CONFIRMATION_COOLDOWN_SECONDS * 1000;
    expect(resendSecondsRemaining(availableAt, start)).toBe(60);
    expect(resendSecondsRemaining(availableAt, start + 59000)).toBe(1);
    expect(resendSecondsRemaining(availableAt, start + 60000)).toBe(0);
  });
  it("routes signup and resend links to confirmation, not the dashboard", () => {
    expect(confirmationRedirect("https://roleprove.com")).toBe("https://roleprove.com/auth/confirm");
  });
  it("does not treat an obfuscated duplicate signup as a new account", () => {
    expect(isDuplicateSignup({ identities: [] })).toBe(true);
    expect(isDuplicateSignup({ identities: [{ id: "new-identity" }] })).toBe(false);
    expect(isDuplicateSignup(null)).toBe(false);
  });
});