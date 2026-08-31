import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin';
import { ADMIN_VERIFIED_HEADER } from '@/proxy';

// Raised from Hobby's default 10s so triggerJob's admin-initiated
// scrape-scene re-scrape (actions.ts) can loop every offset batch for a
// branch in one request instead of timing out partway through.
export const maxDuration = 60;

// The real gate is in proxy.ts (a redirect thrown here can't reliably
// change the response status once the root layout has started
// streaming -- see proxy.ts's comment). This is a second, redundant
// check in case a future change to proxy.ts's matcher ever stops
// covering /admin.
//
// Trusts proxy.ts's own verification via a request header instead of
// calling supabase.auth.getUser() again here -- that used to be a
// second full network round-trip to Supabase's auth server on every
// single /admin navigation (confirmed live: ~370ms each, on top of the
// one updateSession() already makes in middleware), which was a real
// chunk of admin tab-switching feeling close to 3s. Falls back to a
// real getUser() check only if the header is missing entirely (e.g.
// proxy.ts's matcher stops covering /admin some day, the exact
// regression this whole layout exists to guard against), so this stays
// a genuine safety net, not a trust-the-client shortcut. A client CAN
// send this header, but proxy.ts deletes any incoming value on entry
// before setting its own, so what arrives here is only ever proxy.ts's
// own verdict; see its comment.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const headerList = await headers();
  const verifiedHeader = headerList.get(ADMIN_VERIFIED_HEADER);

  if (verifiedHeader === '1') {
    return <>{children}</>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdminUser(user)) {
    redirect('/');
  }

  return <>{children}</>;
}
