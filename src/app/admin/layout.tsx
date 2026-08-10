import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';

// The real gate is in proxy.ts (a redirect thrown here can't reliably
// change the response status once the root layout has started
// streaming -- see proxy.ts's comment). This is a second, redundant
// check in case a future change to proxy.ts's matcher ever stops
// covering /admin.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect('/');
  }

  return <>{children}</>;
}
