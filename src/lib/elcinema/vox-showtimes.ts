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

  // Movie blocks are `div.row` elements directly under `div.boxed-0`.
  // Must scope to direct children: `div.boxed-0` itself is also a
  // `div.row`'s ancestor for the whole page body (nav, ads, everything),
  // and a naive `div.row` scan picks that outer wrapper up first --
  // confirmed for real, it matches the page's first movie title via the
  // same `h3 > a` selector and then vacuums up every `table.showtimes` on
  // the entire page as if they all belonged to that one movie.
  $('div.boxed-0 > div.row').each((_, rowEl) => {
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
      // The format heading (`h6.section-title`, e.g. "Standard"/"Gold"/
      // "MAX VIP"/"4DX") is the table's immediately preceding sibling,
      // not a descendant of it -- confirmed for real, `table.find(...)`
      // never matched anything here, which is why every format silently
      // fell back to "Standard" regardless of the table's actual format.
      const format = table.prevAll('h6.section-title').first().find('strong').text().trim() || 'Standard';
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
