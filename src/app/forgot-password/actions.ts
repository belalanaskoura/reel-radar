'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

// Always redirects to the same success state regardless of whether the
// email actually belongs to an account -- confirming/denying account
// existence here would let anyone enumerate real signups by trying
// addresses one at a time, which Supabase's own docs call out for this
// exact endpoint.
export async function requestPasswordReset(formData: FormData) {
  const email = formData.get('email') as string;

  if (!email) {
    redirect('/forgot-password?error=missing_email');
  }

  // Unthrottled, this endpoint is a free mail cannon: it sends a real
  // email to any address supplied, spending Resend quota and putting the
  // sending domain's reputation at risk one attempt at a time. Rejected
  // attempts fall through to the same generic "sent" redirect below
  // rather than saying they were rate limited, for the same
  // non-enumeration reason as the rest of this action.
  const ip = clientIp(await headers());
  const normalizedEmail = email.trim().toLowerCase();
  const [ipAllowed, emailAllowed] = await Promise.all([
    checkRateLimit(`reset:ip:${ip}`, 5, 3600),
    checkRateLimit(`reset:email:${normalizedEmail}`, 3, 3600),
  ]);
  if (!ipAllowed || !emailAllowed) {
    redirect('/forgot-password?sent=1');
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
