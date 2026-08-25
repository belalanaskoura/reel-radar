import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE_OPTIONS } from './cookie-options';

// Refreshes the auth session cookie on every request. Required by
// @supabase/ssr so server components (which can't write cookies) see an
// up-to-date session; the actual write happens here in middleware.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Must call getUser() (not getSession()): it revalidates the token
  // against Supabase's servers rather than trusting the cookie as-is.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
