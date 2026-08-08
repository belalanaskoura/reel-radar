import { NextResponse } from 'next/server';
import { chromium } from 'playwright-core';
import chromiumBinary from '@sparticuz/chromium-min';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { normalizeTitle } from '@/lib/matching/normalize';

// Version must match the installed @sparticuz/chromium-min package
// version (see package.json) -- the hosted pack and the npm package are
// versioned together and must agree.
const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';

// VOX's own site (egy.voxcinemas.com) sits behind Akamai Bot Manager --
// confirmed unreachable via plain fetch/curl and even headless Chromium
// with a realistic UA. A real (non-automation-flagged) browser session,
// warmed up on the homepage first, does get through. This route is the
// ONLY place this app touches VOX's own site at all, and only visits
// /movies/whatson and /movies/comingsoon -- both explicitly allowed by
// VOX's robots.txt (which disallows /booking/, /account/, /orders/, and
// any URL with a query string, none of which this route ever requests).
//
// Purpose: discover each currently-showing/upcoming movie's real VOX
// slug (e.g. "the-odyssey"), matched by normalized title against this
// app's own `movies` rows, and store it in vox_movie_slugs so the movie
// detail/watchlist pages can link to a real, day-specific VOX booking
// page (https://egy.voxcinemas.com/movies/{slug}?d=YYYYMMDD#showtimes)
// instead of just the homepage. That link is only ever placed as an <a
// href> for a signed-in user's own browser to open -- this app's server
// never fetches it (robots.txt disallows query strings on that site).
const VOX_PAGES = [
  'https://egy.voxcinemas.com/movies/whatson',
  'https://egy.voxcinemas.com/movies/comingsoon',
];

export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const browser = await chromium.launch({
    args: chromiumBinary.args,
    executablePath: await chromiumBinary.executablePath(CHROMIUM_PACK_URL),
    headless: true,
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
      timezoneId: 'Africa/Cairo',
    });
    // Confirmed necessary during feasibility testing: without this,
    // Akamai's bot detection flags the session and every request hangs
    // or errors.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await context.newPage();

    // Warm up on the homepage before navigating anywhere else -- every
    // successful probe during feasibility testing did this first; a cold
    // direct navigation to a deep page was never confirmed to work on
    // its own.
    await page.goto('https://egy.voxcinemas.com/', { waitUntil: 'commit', timeout: 60000 });
    await page.waitForTimeout(5000);

    const found: { title: string; slug: string }[] = [];
    for (const url of VOX_PAGES) {
      await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
      await page.waitForTimeout(6000);

      const pageLinks = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href^="/movies/"]'))
          .map((a) => ({ href: a.getAttribute('href'), text: a.textContent?.trim() ?? '' }))
          .filter((l) => l.href && !l.href.includes('#') && !/whatson|comingsoon/.test(l.href)),
      );
      for (const { href, text } of pageLinks) {
        if (!href || !text) continue;
        const slug = href.replace(/^\/movies\//, '');
        found.push({ title: text, slug });
      }
    }

    const supabase = createServiceRoleClient();
    const { data: movies } = await supabase.from('movies').select('id, title');
    const byNormalizedTitle = new Map((movies ?? []).map((m) => [normalizeTitle(m.title), m.id]));

    const seenSlugs = new Set<string>();
    let matched = 0;
    for (const { title, slug } of found) {
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);

      const movieId = byNormalizedTitle.get(normalizeTitle(title));
      if (!movieId) continue; // no matching movie row yet -- fine, a later run may create one

      const { error } = await supabase
        .from('vox_movie_slugs')
        .upsert(
          { movie_id: movieId, vox_slug: slug, last_seen_at: new Date().toISOString() },
          { onConflict: 'movie_id' },
        );
      if (!error) matched += 1;
    }

    return NextResponse.json({ found: seenSlugs.size, matched });
  } finally {
    await browser.close();
  }
}
