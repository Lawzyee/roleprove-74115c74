export const CONFIRMATION_COOLDOWN_SECONDS = 60;

export function resendSecondsRemaining(availableAt: number, now = Date.now()) {
  return Math.max(0, Math.ceil((availableAt - now) / 1000));
}

export function authErrorMessage(error: unknown): string {
  const value = error as { code?: string; message?: string; status?: number } | null;
  const code = value?.code ?? "";
  const message = value?.message ?? "";
  if (code === "email_not_confirmed") return "Please confirm your email first";
  if (["user_already_exists", "email_exists"].includes(code) || /already (registered|exists)/i.test(message)) {
    return "This email is already registered. Please sign in instead.";
  }
  if (code === "weak_password" || /password.*(weak|short|least|requirements)/i.test(message)) {
    return "Please choose a stronger password that meets the password requirements.";
  }
  if (code === "invalid_credentials") return "The email or password isn't correct. Please try again.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || value?.status === 429) {
    return "Too many requests. Please wait a minute before trying again.";
  }
  if (code === "signup_disabled") return "Sign-ups are temporarily unavailable. Please try again later.";
  if (/fetch|network|connection|timeout/i.test(message) || error instanceof TypeError) {
    return "We couldn't connect. Check your internet connection and try again.";
  }
  return "We couldn't complete your request. Please try again in a moment.";
}

export function isDuplicateSignup(user: { identities?: unknown[] } | null) {
  // Auth can hide an existing confirmed account behind a successful response.
  return user?.identities?.length === 0;
}

export function confirmationRedirect(origin: string) {
  return `${origin}/auth/confirm`;
}