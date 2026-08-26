// Shape check for a Scene date before it's interpolated into an outbound
// URL. Both public showtime server actions take a date straight from the
// caller and splice it into `?business_day=`, so this bounds what can end
// up in that query string to literally DD-MM-YYYY.
export function isValidShowtimeDate(date: string): boolean {
  return /^\d{2}-\d{2}-\d{4}$/.test(date);
}

// Shape check for a Scene movie slug, for the same reason: a slug is
// spliced into the URL path. Scene's own slugs are lowercase words joined
// by hyphens, sometimes with digits (a year or a sequel number).
export function isValidSceneSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug) && slug.length <= 120;
}

// Scene's own date format throughout this app: DD-MM-YYYY, matching the
// `business_day` param its AJAX showtime endpoint expects (see
// fetchDayShowtimes). Shared here since both the per-cinema page and the
// movie detail page's showtime picker need to parse/sort/filter it.
export function parseSceneDate(date: string): Date {
  const [d, m, y] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Drops dates already in the past. Cached bookable-date lists
// (showtimes_cache.raw_showtimes) only refresh on the next scrape/poll
// cycle, so a date can outlive its own relevance (e.g. "yesterday" still
// listed) until then -- neither page should show a picker tab for a day
// that's already gone.
export function filterFutureDates(dates: string[]): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dates.filter((date) => parseSceneDate(date) >= today);
}

// "Thu, Oct 24" style label for a Scene date, used by both date-tab
// pickers (DateTabStrip's consumers).
export function formatSceneDateLabel(date: string): string {
  const [day, month, year] = date.split('-');
  if (!day || !month || !year) return date;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// elCinema/VOX's own date format (YYYY-MM-DD, ISO) -- a distinct format
// from Scene's dd-mm-yyyy above, so these are separate functions rather
// than one shared parser guessing at the input shape.
export function parseIsoDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function filterFutureIsoDates(dates: string[]): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dates.filter((date) => parseIsoDate(date) >= today);
}

export function formatIsoDateLabel(date: string): string {
  const [year, month, day] = date.split('-');
  if (!day || !month || !year) return date;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// elCinema's own showtime format: "11:45 am", "12:30 pm", and two special
// cases that don't follow standard 12-hour rules -- "12:00 midnight" and
// "12:30 midnight" both mean just after midnight (the very start of the
// next calendar day), not noon. Confirmed for real against VOX's live
// showtime data; naively parsing "12:00 midnight" as noon would silently
// filter out legitimate late-night showtimes on the "already past" check
// below whenever the current time is between noon and midnight.
export function parseElCinemaTimeToMinutes(time: string): number | null {
  const midnight = time.match(/^(\d{1,2}):(\d{2})\s+midnight$/i);
  if (midnight) return Number(midnight[1]) % 12 * 60 + Number(midnight[2]);

  const match = time.match(/^(\d{1,2}):(\d{2})\s+(am|pm)$/i);
  if (!match) return null;
  let hours = Number(match[1]) % 12;
  if (match[3].toLowerCase() === 'pm') hours += 12;
  return hours * 60 + Number(match[2]);
}

// Drops individual showtimes that have already passed today; VOX's
// showtime detail otherwise refreshes once a day (scrape-vox), so a
// morning showing is still listed well into the evening until the next
// scrape. Only today's date needs filtering -- every later date's
// showtimes are all still in the future by definition. Not a
// sold-out/availability signal (elCinema exposes none, confirmed against
// its live markup), purely "this specific time has already happened."
export function filterPastVoxShowtimes<T extends { time: string }>(
  date: string,
  showtimes: T[],
): T[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parseIsoDate(date).getTime() !== today.getTime()) return showtimes;

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  return showtimes.filter((s) => {
    const minutes = parseElCinemaTimeToMinutes(s.time);
    return minutes === null || minutes >= nowMinutes;
  });
}
