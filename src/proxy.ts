import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isAdminEmail } from '@/lib/admin';

// Header name AdminLayout trusts to skip its own getUser() call -- only
// ever set here, after updateSession()'s real getUser() round-trip, and
// only readable server-side via next/headers, never sent by a real
// client (Next.js middleware fully replaces the request's own headers
// object via NextResponse.next({ request }) below, so an incoming
// request can't forge this by just setting the header itself; whatever
// a client sends is discarded and replaced by what's set here).
export const ADMIN_VERIFIED_HEADER = 'x-admin-verified';

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const isAdminPath = request.nextUrl.pathname.startsWith('/admin');
  const isAdmin = isAdminEmail(user?.email);

  // Checked here, not in a layout: a redirect thrown from a nested async
  // server component can't retroactively change the response status once
  // the root layout has already started streaming, so a non-JS request
  // would briefly see real /admin content in the initial HTML. Middleware
  // runs before any rendering starts, so this redirect is a real one.
  if (isAdminPath && !isAdmin) {
    return NextResponse.redirect(new URL('/', request.url));
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
    return NextResponse.next({ request });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
