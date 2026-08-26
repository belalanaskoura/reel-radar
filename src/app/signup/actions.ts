'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { logEvent } from '@/lib/analytics';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-error-codes';

export async function signup(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const ip = clientIp(await headers());
  const allowed = await checkRateLimit(`signup:ip:${ip}`, 5, 3600);
  if (!allowed) {
    redirect('/signup?error=rate_limited');
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    redirect('/signup?error=weak_password');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  // Never reflects Supabase's own error text -- "User already registered"
  // for a taken address is a clean account-enumeration oracle, and this
  // is the one auth endpoint where that specifically matters (unlike
  // sign-in or forgot-password, a failed signUp has no legitimate reason
  // to tell the caller *why* in more detail than this).
  if (error) {
    redirect('/signup?error=signup_failed');
  }

  if (data.user) {
    logEvent({ type: 'signup', payload: { user_id: data.user.id } });
  }

  // With Supabase's "Confirm email" setting ON, signUp returns a user but
  // NO session -- the account isn't usable until the emailed link is
  // clicked. This flow previously redirected straight to /notifications
  // regardless, which under that setting drops a brand-new signup onto a
  // signed-out page with no explanation. Branch on the session instead so
  // turning confirmation on (which is what stops anyone claiming an
  // ADMIN_EMAILS address they don't own -- see lib/admin.ts) doesn't
  // require touching this file again.
  if (!data.session) {
    redirect('/signup?check_email=1');
  }

  redirect('/notifications?from=signup');
}
