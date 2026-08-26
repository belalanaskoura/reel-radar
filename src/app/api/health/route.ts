import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// Deliberately public/unauthenticated (unlike every scheduled job route,
// which requires x-sync-secret) -- an external uptime monitor (cron-
// job.org itself, or any free status-check service) needs to reach this
// with no credential. Before this route existed, an outage (Vercel or
// Supabase) had no detection path at all besides a user complaining or
// someone noticing the scheduled scrape/poll jobs had gone quiet.
// Checked dependency is deliberately narrow: a real Supabase round-trip
// (the app's one hard dependency every page needs), not TMDB/Resend/
// web-push/Scene/elCinema, which the app already degrades gracefully
// without (see error.tsx/RootLayout's getUser() fallback).
export async function GET() {
  const startedAt = Date.now();

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('branches').select('id').limit(1);

    if (error) {
      return NextResponse.json(
        { status: 'error', error: error.message, duration_ms: Date.now() - startedAt },
        { status: 503 },
      );
    }

    return NextResponse.json({ status: 'ok', duration_ms: Date.now() - startedAt });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: String(err).slice(0, 500), duration_ms: Date.now() - startedAt },
      { status: 503 },
    );
  }
}
