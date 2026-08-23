import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Handles the redirect back from Supabase after either an OAuth provider
// (Google) completes sign-in, or a password-recovery email link is
// clicked -- both use the same PKCE code-exchange shape
// (exchangeCodeForSession), so one route covers both. Google sign-in
// always lands on /browse regardless of new-vs-returning user: there's
// no documented, stable signal on the client response to distinguish the
// two, and the /browse push banner already covers the "set up push
// notifications" nudge that /notifications would otherwise give new
// signups. The password-recovery flow needs a different landing page
// (/reset-password, to actually set a new password) -- passed via a
// `next` param on the redirectTo URL (see
// src/app/forgot-password/actions.ts) rather than inferring the flow
// from the code itself, since Supabase's response shape doesn't
// distinguish them either.
function safeNextPath(next: string | null): string {
  // Only a same-origin relative path is ever honored -- a `next` value
  // is attacker-controllable (it's a URL query param on a link this app
  // itself generates, but a malicious actor could still craft their own
  // link to this route with an arbitrary `next`), so an absolute or
  // protocol-relative value must never be followed as an open redirect.
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/browse';
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent('Sign-in failed. Please try again.')}`, origin),
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
      new URL(`/signin?error=${encodeURIComponent('Sign-in failed. Please try again.')}`, origin),
    );
  }

  return NextResponse.redirect(new URL(next, origin));
}
