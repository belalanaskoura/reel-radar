import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side client scoped to the signed-in user's session, read from
// cookies. Respects RLS (unlike the service-role client). Use this in
// server components, route handlers, and server actions that act on
// behalf of the current user.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component -- ignorable when
            // middleware is refreshing the session on every request.
          }
        },
      },
    },
  );
}
