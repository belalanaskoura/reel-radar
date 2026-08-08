import * as cheerio from 'cheerio';
import { fetchElCinemaHtml } from './fetcher';

const BASE_URL = 'https://elcinema.com';

export interface VoxShowtime {
  time: string; // e.g. "11:45 am", exactly as elCinema displays it
  price: string | null; // e.g. "150 EGP"
}

export interface VoxMovieListing {
  elcinemaId: number; // from /en/work/{id}/
  title: string;
  formats: { format: string; showtimes: VoxShowtime[] }[]; // "Standard", "MAX VIP", ...
}

export interface VoxDayShowtimes {
  date: string; // YYYY-MM-DD, elCinema's own ?date= format (NOT Scene's dd-mm-yyyy)
  branchName: string | null;
  address: string | null;
  movies: VoxMovieListing[];
}

// One request per day per branch: elCinema has no cheap "is this
// bookable" endpoint separate from the full showtime detail (unlike
// Scene's checkBookability/fetchDayShowtimes two-phase split) -- every
// request here already returns full per-movie/per-format/per-showtime
// detail for that one day.
export async function fetchVoxShowtimes(
  theaterId: string,
  date: string, // YYYY-MM-DD
): Promise<VoxDayShowtimes> {
  const url = `${BASE_URL}/en/theater/${theaterId}/?date=${date}`;
  const html = await fetchElCinemaHtml(url);
  const $ = cheerio.load(html);

  const branchName = $('h1 .left').first().text().trim() || null;
  const address = extractAddress($);

  const movies: VoxMovieListing[] = [];

  // Movie blocks are siblings, each `<div class="row">...</div>`
  // separated by `<hr />`. Do NOT loop bare `h3` tags: the page also has
  // an `h3.section-title` for the per-day date heading, which is not a
  // movie.
  $('div.row').each((_, rowEl) => {
    const row = $(rowEl);
    const titleLink = row.find('h3 > a[href^="/en/work/"]').first();
    const href = titleLink.attr('href') ?? '';
    const match = href.match(/\/en\/work\/(\d+)\/?/);
    if (!match) return; // not a movie row

    const elcinemaId = Number(match[1]);
    const title = titleLink.text().trim();
    if (!title) return;

    const formats: VoxMovieListing['formats'] = [];
    row.find('table.showtimes').each((_, tableEl) => {
      const table = $(tableEl);
      const format = table.find('h6.section-title strong').first().text().trim() || 'Standard';
      const showtimes: VoxShowtime[] = [];

      table.find('tr').each((_, trEl) => {
        const cells = $(trEl).find('td');
        if (cells.length < 2) return;
        const time = $(cells[1]).text().trim();
        if (!time) return;
        const priceText = $(trEl).find('.price').text().replace(/\s+/g, ' ').trim();
        showtimes.push({ time, price: priceText || null });
      });

      if (showtimes.length > 0) formats.push({ format, showtimes });
    });

    movies.push({ elcinemaId, title, formats });
  });

  return { date, branchName, address, movies };
}

function extractAddress($: cheerio.CheerioAPI): string | null {
  const text = $('a[href="#google-map-theater"]').parent().text().trim();
  return text || null;
}
