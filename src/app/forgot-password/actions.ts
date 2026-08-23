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
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });

  // Never shown to the user (would confirm whether this email has an
  // account) -- logged server-side only, visible in Vercel's function
  // logs, so a real delivery/config failure isn't completely invisible
  // during setup or if it silently breaks again later.
  if (error) {
    console.error('resetPasswordForEmail failed:', error.message);
  }

  redirect('/forgot-password?sent=1');
}
