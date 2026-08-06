import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Handles the redirect back from Supabase after an OAuth provider (Google)
// completes sign-in. Always lands on /browse regardless of new-vs-returning
// user: there's no documented, stable signal on the client response to
// distinguish the two, and the /browse push banner already covers the
// "set up push notifications" nudge that /notifications would otherwise
// give new signups.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent('Google sign-in failed. Please try again.')}`, origin),
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(error.message)}`, origin));
    }
  } catch {
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent('Google sign-in failed. Please try again.')}`, origin),
    );
  }

  return NextResponse.redirect(new URL('/browse', origin));
}
