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
  imdbId: string | null;
}

// Fetches one movie's elCinema page for its IMDb ID (the reliable TMDB
// cross-reference -- confirmed most work pages have one; title-search
// fallback handles the ones that don't).
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

  return { elcinemaId, title, releaseYear, imdbId };
}
