import type { User } from '@supabase/supabase-js';

// Pure allowlist check against ADMIN_EMAILS. This alone is NOT enough to
// authorize a session -- an email string on a session is only meaningful
// if Supabase actually verified the person owns that mailbox. Use
// isAdminUser() for anything gating access; this stays exported only for
// callers that are validating the configured list itself rather than a
// session (see /api/admin-digest, which maps env addresses to user ids).
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

// The real admin gate. Requires BOTH that the address is allowlisted and
// that Supabase has confirmed it.
//
// Without the email_confirmed_at half, admin is granted on a self-asserted
// string: with Supabase's "Confirm email" setting off, anyone can sign up
// as an ADMIN_EMAILS address they don't own and receive a session carrying
// it. Supabase rejects signUp for an address that already has an account,
// so the exposure is any configured admin address nobody has registered
// yet -- a colleague added ahead of onboarding, a role address, a spare.
// That window stays open indefinitely and fails silently, so this check
// does not depend on the dashboard toggle being set correctly.
export function isAdminUser(user: User | null | undefined): boolean {
  if (!user?.email) return false;
  if (!user.email_confirmed_at) return false;
  return isAdminEmail(user.email);
}
