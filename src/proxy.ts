import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isAdminUser } from '@/lib/admin';
import { buildCsp } from '@/lib/csp';

// Header name AdminLayout trusts to skip its own getUser() call. A client
// CAN send this header -- nothing about middleware strips it for us -- so
// proxy() explicitly deletes it on entry before any code reads it, and
// only sets it after updateSession()'s real getUser() round-trip has
// confirmed an allowlisted, email-confirmed admin.
export const ADMIN_VERIFIED_HEADER = 'x-admin-verified';

export async function proxy(request: NextRequest) {
  // Strip any incoming value before anything else runs. Contrary to what
  // this file used to claim, middleware does NOT replace the request's
  // headers -- `request.headers` IS the incoming set, and the code below
  // only ever sets this header, never clears it. The /admin redirect
  // happens to run first today, so a forged value was never actually
  // honored, but that made the invariant incidental rather than real.
  request.headers.delete(ADMIN_VERIFIED_HEADER);

  // Fresh per request. Set on the REQUEST's CSP header too, not just the
  // response: that's how Next.js discovers the nonce and stamps it onto
  // its own script tags (including the next/script theme-flash preventer
  // in layout.tsx). Without the request-side header the bootstrap script
  // goes out unnonced and the page dies under its own policy.
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = buildCsp(nonce);
  request.headers.set('x-nonce', nonce);
  request.headers.set('content-security-policy', csp);

  const { response, user } = await updateSession(request);
  response.headers.set('content-security-policy', csp);

  const isAdminPath = request.nextUrl.pathname.startsWith('/admin');
  const isAdmin = isAdminUser(user);

  // Checked here, not in a layout: a redirect thrown from a nested async
  // server component can't retroactively change the response status once
  // the root layout has already started streaming, so a non-JS request
  // would briefly see real /admin content in the initial HTML. Middleware
  // runs before any rendering starts, so this redirect is a real one.
  if (isAdminPath && !isAdmin) {
    const redirectResponse = NextResponse.redirect(new URL('/', request.url));
    redirectResponse.headers.set('content-security-policy', csp);
    return redirectResponse;
  }

  // AdminLayout's own redundant getUser() call (a second real network
  // round-trip to Supabase's auth server on every single /admin
  // navigation, on top of the one updateSession() already just made --
  // confirmed live to add ~370ms each, a real chunk of the "admin tab
  // switching takes ~3s" complaint this fixes) can be replaced with a
  // read of this header instead, since middleware has already done the
  // real verification by this point. Reaching this line means isAdmin is
  // already true for an admin path (the redirect above handles false).
  if (isAdminPath) {
    request.headers.set(ADMIN_VERIFIED_HEADER, '1');
    const adminResponse = NextResponse.next({ request });
    adminResponse.headers.set('content-security-policy', csp);
    return adminResponse;
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
