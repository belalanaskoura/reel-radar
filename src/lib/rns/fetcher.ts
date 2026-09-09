import * as cheerio from 'cheerio';

const BASE_URL = 'https://rnscinemas.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 8_000;

// RNS's robots.txt only disallows booking/checkout paths (`*/booking_cart/`,
// `*/start_booking/`, `*/cancel_booking`, `*/checkout`) -- /en/coming-soon
// is unrestricted. Same courtesy delay convention as the Scene/elCinema
// fetchers regardless of what's technically allowed.
export const REQUEST_DELAY_MS = 1_000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRnsHtml(url: string): Promise<string> {
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

export interface RnsListing {
  slug: string;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null; // YYYY-MM-DD
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04',
  may: '05', jun: '06', jul: '07', aug: '08',
  sep: '09', oct: '10', nov: '11', dec: '12',
};

// Parses RNS's "10, Sep 2026" listing-card date format into "2026-09-10".
// Returns null on anything unexpected rather than guessing.
function parseRnsDate(text: string): string | null {
  const match = text.trim().match(/(\d{1,2}),?\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (!match) return null;
  const day = match[1].padStart(2, '0');
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  const year = match[3];
  if (!month) return null;
  return `${year}-${month}-${day}`;
}

// Scrapes RNS's coming-soon page: a single, fully server-rendered page
// (confirmed for real -- no pagination, no AJAX, all cards present in the
// static HTML) listing every movie Renaissance Cinemas has scheduled. Each
// card's <img data-src> is the real poster (the plain src is a shared
// lazy-load placeholder, `opt.jpg`); the release date sits in the card's
// overlay list. No IMDb id anywhere on this page or the movie's own detail
// page, unlike elCinema -- TMDB matching for RNS titles relies on the same
// English/Arabic search + elCinema-IMDb-fallback pipeline every other
// placeholder source already goes through.
export async function fetchComingSoon(): Promise<RnsListing[]> {
  const html = await fetchRnsHtml(`${BASE_URL}/en/coming-soon`);
  const $ = cheerio.load(html);

  const listings: RnsListing[] = [];
  const seen = new Set<string>();

  $('a.movie_item_link').each((_, el) => {
    const link = $(el);
    const href = link.attr('href') ?? '';
    const match = href.match(/\/en\/movie\/([a-z0-9-]+)\/?$/i);
    if (!match) return;
    const slug = match[1];
    if (seen.has(slug)) return;

    const title = (link.attr('title') || link.find('.movie_title').first().text()).trim();
    if (!title) return;

    const posterUrl = link.find('img').first().attr('data-src') || null;
    const dateText = link.find('.movie_up_notes li').first().text();
    const releaseDate = dateText ? parseRnsDate(dateText) : null;

    seen.add(slug);
    listings.push({ slug, title, posterUrl, releaseDate });
  });

  return listings;
}
