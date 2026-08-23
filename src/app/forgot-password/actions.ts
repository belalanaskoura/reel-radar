'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Always redirects to the same success state regardless of whether the
// email actually belongs to an account -- confirming/denying account
// existence here would let anyone enumerate real signups by trying
// addresses one at a time, which Supabase's own docs call out for this
// exact endpoint.
export async function requestPasswordReset(formData: FormData) {
  const email = formData.get('email') as string;

  if (!email) {
    redirect(`/forgot-password?error=${encodeURIComponent('Enter your email address.')}`);
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });

  redirect('/forgot-password?sent=1');
}
