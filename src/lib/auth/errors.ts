/**
 * Map raw Supabase auth messages to friendly copy. Supabase returns terse,
 * provider-flavoured strings ("Invalid login credentials"); for an internal
 * tool we show something clearer and fall through to the raw message when a
 * given string isn't mapped.
 */
const MESSAGES: Record<string, string> = {
  "Invalid login credentials": "Wrong email or password.",
  "Email not confirmed": "Confirm your email first — check your inbox.",
  "User already registered": "An account with this email already exists.",
  "Auth session missing!": "Your link expired. Request a new one.",
  "New password should be different from the old password.":
    "Choose a password you haven't used before.",
};

export function authErrorMessage(raw?: string | null): string {
  if (!raw) return "Something went wrong. Please try again.";
  return MESSAGES[raw] ?? raw;
}

/** Friendly copy for the `?error=` codes the /auth/confirm route redirects with. */
export function authErrorFromCode(code?: string | null): string | null {
  if (!code) return null;
  if (code === "link_invalid") return "That link is invalid or expired. Request a new one.";
  return "Something went wrong. Please try again.";
}
