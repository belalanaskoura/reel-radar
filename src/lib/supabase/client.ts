import { createBrowserClient } from '@supabase/ssr';
import { AUTH_COOKIE_OPTIONS } from './cookie-options';

// Same cookie options as the server clients. If the browser client wrote
// cookies with different flags than the server reads/writes, the two
// halves of the PKCE flow would disagree about the same cookie.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: AUTH_COOKIE_OPTIONS },
  );
}
