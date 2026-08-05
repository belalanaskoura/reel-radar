import * as cheerio from 'cheerio';
import type {
  BranchId,
  SceneMovieListing,
  SceneDayShowtimes,
  SceneShowtime,
  BookabilityResult,
} from './types';
import { BRANCH_BASE_URLS } from './types';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 15_000;

// Same courtesy delay spider-bot used between requests on a single run.
export const REQUEST_DELAY_MS = 2_000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Request to ${url} failed: ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseMovieLinks(
  html: string,
  source: SceneMovieListing['source'],
): SceneMovieListing[] {
  const $ = cheerio.load(html);
  const seenSlugs = new Set<string>();
  const movies: SceneMovieListing[] = [];

  $('a[href*="/movie-details/"]').each((_, el) => {
    const href = $(el).attr('href');
    const title = $(el).attr('title');
    if (!href || !title) return;

    const match = href.match(/\/movie-details\/([^/]+)\.html/);
    if (!match) return;

    const slug = match[1];
    if (seenSlugs.has(slug)) return;
    seenSlugs.add(slug);

    movies.push({ title: title.trim(), slug, url: href, source });
  });

  return movies;
}

export async function fetchNowShowing(branch: BranchId): Promise<SceneMovieListing[]> {
  const html = await get(`${BRANCH_BASE_URLS[branch]}/`);
  return parseMovieLinks(html, 'now_showing');
}

export async function fetchComingSoon(branch: BranchId): Promise<SceneMovieListing[]> {
  const html = await get(`${BRANCH_BASE_URLS[branch]}/next_releasing`);
  return parseMovieLinks(html, 'coming_soon');
}

// Fetches now-showing + coming-soon listings for one branch, deduped by
// slug (now_showing wins on conflict, same as spider-bot). This is the
// only place allowed to discover slugs -- callers must never guess a slug,
// per the site's robots.txt and the "invalid slug still returns HTTP 200"
// behavior found in Phase 0.
export async function fetchAllListings(branch: BranchId): Promise<SceneMovieListing[]> {
  const nowShowing = await fetchNowShowing(branch);
  await sleep(REQUEST_DELAY_MS);
  const comingSoon = await fetchComingSoon(branch);

  const bySlug = new Map<string, SceneMovieListing>();
  for (const movie of [...nowShowing, ...comingSoon]) {
    const existing = bySlug.get(movie.slug);
    if (!existing || movie.source === 'now_showing') {
      bySlug.set(movie.slug, movie);
    }
  }
  return [...bySlug.values()];
}

// A movie-details page always has a "no showtimes available" message,
// which is only hidden once the day-selector list (.glxDaysList) is
// populated with real date links (Phase 0 finding, ported directly from
// spider-bot's is_bookable()).
export async function checkBookability(movieDetailsUrl: string): Promise<BookabilityResult> {
  const html = await get(movieDetailsUrl);
  const $ = cheerio.load(html);

  const dayItems = $('.glxDaysList li.calanderdays');
  if (dayItems.length === 0) {
    return { bookable: false, availableDates: [] };
  }

  // The markup wraps each <li class="calanderdays"> in a parent <a
  // href="javascript:LoadShowtimes('DD-MM-YYYY')">, rather than the more
  // usual <li><a>...</a></li> nesting -- confirmed against real HTML.
  const availableDates: string[] = [];
  dayItems.each((_, el) => {
    const href = $(el).parent('a').attr('href') ?? '';
    const match = href.match(/LoadShowtimes\('([\d-]+)'\)/);
    if (match) availableDates.push(match[1]);
  });

  return { bookable: availableDates.length > 0, availableDates };
}

// Fetches the showtime list for one specific day via the AJAX fragment
// endpoint discovered in Phase 0 (movie-details.html?business_day=DD-MM-YYYY&ajax=1).
// One request per day -- callers should only call this for movies already
// confirmed bookable, and should stay mindful of total request volume.
export async function fetchDayShowtimes(
  movieDetailsUrl: string,
  date: string,
): Promise<SceneDayShowtimes> {
  const url = `${movieDetailsUrl}?business_day=${date}&ajax=1`;
  const html = await get(url);
  const $ = cheerio.load(html);

  const showtimes: SceneShowtime[] = [];
  $('.ex_vip_content, .ex_stand_content').each((_, section) => {
    const format = $(section).find('.ex_vip, .ex_stand').first().text().trim();
    $(section)
      .find('li a')
      .each((_, a) => {
        const bookingUrl = $(a).attr('href') ?? '';
        const time = $(a).text().trim();
        const soldOut = $(a).hasClass('showtime_soldout');
        if (bookingUrl && bookingUrl.startsWith('http')) {
          showtimes.push({ format, time, bookingUrl, soldOut });
        }
      });
  });

  return { date, showtimes };
}
