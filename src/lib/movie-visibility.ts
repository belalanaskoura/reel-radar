// Temporary: movies with no poster are hidden from browsing surfaces until
// this date, then shown again automatically -- delete this file and its
// call sites once past it.
const HIDE_POSTERLESS_UNTIL = '2026-09-01';

export function hidePosterlessMovies(): boolean {
  return new Date().toISOString().slice(0, 10) < HIDE_POSTERLESS_UNTIL;
}
