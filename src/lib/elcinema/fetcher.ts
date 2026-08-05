import * as cheerio from 'cheerio';

const BASE_URL = 'https://elcinema.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 15_000;

// elCinema's robots.txt allows all crawlers (`User-agent: * / Allow: /`),
// a real difference from Scene Cinemas' disallow-all policy -- still
// polite about frequency since that's the right default regardless of
// what's technically allowed.
export const REQUEST_DELAY_MS = 1_000;

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

export interface BoxOfficeEntry {
  elcinemaId: number;
  title: string;
}

// Fetches one week's Egypt box office listing. Query params confirmed
// against the site's own filter form (`year`/`week`, not path segments).
export async function fetchBoxOfficeWeek(year: number, week: number): Promise<BoxOfficeEntry[]> {
  const url = `${BASE_URL}/en/boxoffice/EG?country=EG&year=${year}&week=${week}`;
  const html = await get(url);
  const $ = cheerio.load(html);

  const entries: BoxOfficeEntry[] = [];
  const seen = new Set<number>();

  $('a[href*="/en/work/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const match = href.match(/\/en\/work\/(\d+)\/?$/);
    if (!match) return;
    const elcinemaId = Number(match[1]);
    if (seen.has(elcinemaId)) return;

    const title = $(el).text().trim();
    if (!title) return;

    seen.add(elcinemaId);
    entries.push({ elcinemaId, title });
  });

  return entries;
}

export interface ElCinemaWorkDetails {
  elcinemaId: number;
  title: string;
  releaseYear: number | null;
  releaseDate: string | null;
  imdbId: string | null;
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

// Parses "5 August" + "2026" into "2026-08-05". Returns null on anything
// unexpected rather than guessing.
function parseElCinemaDate(dayMonthText: string, yearText: string): string | null {
  const match = dayMonthText.trim().match(/(\d{1,2})\s+([A-Za-z]+)/);
  const year = yearText.trim();
  if (!match || !/^\d{4}$/.test(year)) return null;
  const day = match[1].padStart(2, '0');
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

// Fetches one movie's elCinema page for its IMDb ID (the reliable TMDB
// cross-reference -- confirmed most work pages have one; title-search
// fallback handles the ones that don't) and its Egypt release date, per
// the "Release Date: <day month> <year> (Egypt)" line elCinema shows on
// every work page -- a real day-level date, not just the release year.
export async function fetchWorkDetails(elcinemaId: number): Promise<ElCinemaWorkDetails> {
  const url = `${BASE_URL}/en/work/${elcinemaId}/`;
  const html = await get(url);
  const $ = cheerio.load(html);

  const title = $('h1 .left').first().text().trim();

  const yearText = $('h1 .left').eq(1).text();
  const yearMatch = yearText.match(/\((\d{4})\)/);
  const releaseYear = yearMatch ? Number(yearMatch[1]) : null;

  const imdbHref = $('a[href*="imdb.com/title/"]').attr('href') ?? '';
  const imdbMatch = imdbHref.match(/title\/(tt\d+)/);
  const imdbId = imdbMatch ? imdbMatch[1] : null;

  const releaseDate = extractEgyptReleaseDate($);

  return { elcinemaId, title, releaseYear, releaseDate, imdbId };
}

// The primary "Release Date: <a>5 August</a> <a>2026</a> (Egypt)" line
// sits in the first `ul.list-separator.inline li` on the work page and
// is only present at all when the movie's primary release is Egypt's;
// for movies with a non-Egypt primary release, the same date/country
// pair shows up further down in a per-country breakdown list instead
// (`"Egypt [<a>5 August</a> <a>2026</a>]"`) -- both are checked.
function extractEgyptReleaseDate($: cheerio.CheerioAPI): string | null {
  let found: string | null = null;

  $('li').each((_, el) => {
    if (found) return;
    const li = $(el);
    const text = li.text();
    if (!text.includes('Release Date:') && !text.includes('Egypt')) return;
    if (!text.includes('Egypt')) return;

    const links = li.find('a[href*="/release_day/"], a[href*="/release_year/"]');
    if (links.length < 2) return;

    const dayMonth = $(links[0]).text();
    const year = $(links[1]).text();
    const parsed = parseElCinemaDate(dayMonth, year);
    if (parsed) found = parsed;
  });

  return found;
}

export interface ElCinemaSearchResult {
  elcinemaId: number;
  title: string;
}

// Searches elCinema by title, returning the "Titles" section results in
// the site's own relevance order (used as a live fallback for movies not
// yet in the historical box-office backfill, e.g. a brand-new release).
export async function searchElCinema(query: string): Promise<ElCinemaSearchResult[]> {
  const url = `${BASE_URL}/en/search/?q=${encodeURIComponent(query)}`;
  const html = await get(url);
  const $ = cheerio.load(html);

  const results: ElCinemaSearchResult[] = [];
  const seen = new Set<number>();

  $('h3.section-title:contains("Titles")')
    .nextAll('.padded-half')
    .first()
    .find('a[href*="/en/work/"]')
    .each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const match = href.match(/\/en\/work\/(\d+)\/?$/);
      if (!match) return;
      const elcinemaId = Number(match[1]);
      if (seen.has(elcinemaId)) return;

      const title = $(el).text().trim();
      if (!title) return;

      seen.add(elcinemaId);
      results.push({ elcinemaId, title });
    });

  return results;
}
