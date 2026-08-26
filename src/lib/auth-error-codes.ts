// Auth pages render their banner off a short code the app itself chose,
// never a raw error string handed in through the URL -- see L2/L3 in the
// security audit. Two problems that pattern closes at once: an attacker
// crafting ?error=<phishing text> and having it render inside real UI on
// the real domain (React escapes it, so not XSS, but it's a convincing
// scam primitive), and Supabase's own error text leaking implementation
// detail -- worst case, "User already registered" on signup, a clean
// account-enumeration oracle.
//
// Every redirect that used to carry ?error=<message> now carries
// ?error=<code>; unknown/missing codes fall back to a generic message
// rather than rendering nothing.
export const AUTH_ERROR_MESSAGES = {
  rate_limited: 'Too many attempts. Wait a few minutes and try again.',
  invalid_credentials: 'Incorrect email or password.',
  signup_failed: "Couldn't create your account. Check your details and try again.",
  wrong_password: 'That password is incorrect.',
  weak_password: 'Password must be at least 6 characters.',
  update_failed: "Couldn't save that change. Try again.",
  missing_email: 'Enter your email address.',
  link_expired: 'That reset link has expired. Request a new one.',
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_MESSAGES;

// Single source of truth for the password-length floor -- previously
// signup validated nothing server-side at all (a bypassable
// minLength={6} on the input was the only check), while account/security
// and reset-password each hand-rolled their own `length < 6`. Supabase
// Auth's own dashboard policy is the real enforcement point long-term,
// but every path in this codebase should at least agree with itself
// until that's configured.
export const MIN_PASSWORD_LENGTH = 6;

const DEFAULT_MESSAGE = 'Something went wrong. Try again.';

export function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code as AuthErrorCode] ?? DEFAULT_MESSAGE;
}
