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
