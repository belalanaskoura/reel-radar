import type { CookieOptions } from '@supabase/ssr';

// Explicit auth-cookie options, passed to every createServerClient call.
//
// Without this the cookie takes @supabase/ssr's DEFAULT_COOKIE_OPTIONS,
// which are `{ path: '/', sameSite: 'lax', httpOnly: false, maxAge: 400
// days }` and -- the part that matters -- no `secure` key at all. The
// library never sets one. Vercel redirects HTTP to HTTPS at the edge, but
// that redirect happens after the browser has already put a request on
// the wire, so without Secure the session cookie rides along on that
// first plaintext request. Paired with the HSTS header added in
// next.config.ts, this closes that window.
//
// httpOnly deliberately stays false: GoogleSignInButton uses
// createBrowserClient, and the PKCE flow needs to read and write the
// code verifier through document.cookie. Setting it true would silently
// break Google sign-in. The consequence is that an XSS anywhere in the
// app yields the session token, which is why the CSP in next.config.ts
// matters more here than it would in an httpOnly-cookie app.
export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  path: '/',
  sameSite: 'lax',
  httpOnly: false,
  // Off in development so http://localhost still works; on everywhere a
  // real deployment runs.
  secure: process.env.NODE_ENV === 'production',
  // 30 days rather than the library's 400. A session cookie that is not
  // httpOnly, and that (until the reauth fix) could be turned into a
  // permanent takeover, has no business being valid for over a year.
  maxAge: 30 * 24 * 60 * 60,
};
