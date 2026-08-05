import { createClient } from '@supabase/supabase-js';

// Server-only client using the service role key. Bypasses row-level
// security, so this must never be imported from client components.
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase service role configuration');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
