import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isAdminEmail } from '@/lib/admin';

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  // Checked here, not in a layout: a redirect thrown from a nested async
  // server component can't retroactively change the response status once
  // the root layout has already started streaming, so a non-JS request
  // would briefly see real /admin content in the initial HTML. Middleware
  // runs before any rendering starts, so this redirect is a real one.
  if (request.nextUrl.pathname.startsWith('/admin') && !isAdminEmail(user?.email)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
