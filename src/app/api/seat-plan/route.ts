import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { launchBrowser } from '@/lib/scene/browser';
import { fetchSeatPlan } from '@/lib/scene/seat-plan';
import { BRANCH_BASE_URLS, type BranchId } from '@/lib/scene/types';

// Hobby's default function timeout is 10s; a full booking-hold browser
// flow (page load + redirect + waiting for the seat-plan XHR) ran close to
// that in testing, so this asks for the max Hobby allows.
export const maxDuration = 60;

// On-demand, per-page-view seat grid fetch -- not cached like showtimes_cache,
// since seat availability is meaningfully time-sensitive and this is a real
// browser-driven request already (see seat-plan.ts's comment on why a plain
// HTTP scrape can't get this data at all). Gated to signed-in users only,
// same requireUserId pattern as watchlist/actions.ts, since this is a much
// heavier request than any other user-triggered route in the app.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { showtimeUrl } = (await request.json()) as { showtimeUrl?: string };
  if (!showtimeUrl || typeof showtimeUrl !== 'string') {
    return NextResponse.json({ error: 'Missing showtimeUrl' }, { status: 400 });
  }

  const allowedHosts = Object.values(BRANCH_BASE_URLS as Record<BranchId, string>).map(
    (base) => new URL(base).hostname,
  );
  let parsed: URL;
  try {
    parsed = new URL(showtimeUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid showtimeUrl' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:' || !allowedHosts.includes(parsed.hostname) || !/^\/showtime-[a-f0-9]+$/i.test(parsed.pathname)) {
    return NextResponse.json({ error: 'showtimeUrl is not a recognized Scene showtime URL' }, { status: 400 });
  }

  const browser = await launchBrowser();
  try {
    const seatPlan = await fetchSeatPlan(browser, showtimeUrl);
    return NextResponse.json(seatPlan);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch seat plan' },
      { status: 502 },
    );
  } finally {
    await browser.close();
  }
}
