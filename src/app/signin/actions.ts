'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

// Two independent limits, because they stop different attacks. The
// per-IP limit slows a single source spraying many accounts; the
// per-email limit protects one account from a distributed attempt that
// spreads across IPs and would slip under the per-IP limit entirely.
const SIGNIN_PER_IP = { limit: 10, windowSeconds: 900 };
const SIGNIN_PER_EMAIL = { limit: 5, windowSeconds: 900 };

export async function signin(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const ip = clientIp(await headers());
  const normalizedEmail = (email ?? '').trim().toLowerCase();

  const [ipAllowed, emailAllowed] = await Promise.all([
    checkRateLimit(`signin:ip:${ip}`, SIGNIN_PER_IP.limit, SIGNIN_PER_IP.windowSeconds),
    checkRateLimit(`signin:email:${normalizedEmail}`, SIGNIN_PER_EMAIL.limit, SIGNIN_PER_EMAIL.windowSeconds),
  ]);

  // One message for both cases: saying which limit was hit would tell an
  // attacker whether they're being throttled per-account (so the address
  // exists and is worth attacking) or just per-IP.
  if (!ipAllowed || !emailAllowed) {
    redirect(
      `/signin?error=${encodeURIComponent('Too many sign-in attempts. Wait a few minutes and try again.')}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/signin?error=${encodeURIComponent(error.message)}`);
  }

  redirect('/browse');
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/signin');
}
