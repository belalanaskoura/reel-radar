import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE_OPTIONS } from './cookie-options';

// This runs on nearly every request (proxy.ts's matcher excludes only
// static assets/images/auth callback), so a slow (not fully down) auth
// endpoint would otherwise stall every request behind it -- bounded only
// by Vercel's own function timeout, which just means every page hangs
// instead of degrading. getUser() itself takes no signal/timeout option,
// so this is enforced via a custom fetch instead.
const AUTH_TIMEOUT_MS = 8_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

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
      global: { fetch: fetchWithTimeout },
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
  //
  // This runs on nearly every request (proxy.ts's matcher excludes only
  // static assets/images/auth callback) -- before this try/catch existed,
  // a network-level failure here (Supabase Auth down or unreachable, not
  // just a bad/expired session, which GoTrueClient already handles
  // internally by returning user: null) threw straight past this
  // function, uncaught by proxy.ts, crashing every single page load
  // site-wide including /signin itself. The AUTH_TIMEOUT_MS custom fetch
  // above guards the hang case the same way: without it, a slow (not
  // fully down) auth endpoint would stall every request behind it.
  // Falling back to signed-out is safe -- every page already treats
  // user: null as the anonymous case, and the app is fully browsable
  // signed out.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (err) {
    console.error('updateSession: getUser() failed, treating request as signed out', err);
  }

  return { response, user };
}
