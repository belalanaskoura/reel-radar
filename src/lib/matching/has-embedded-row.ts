// Whether a PostgREST embed like `rns_listings(movie_id)` returned any row.
//
// PostgREST shapes an embed by the relationship: one-to-many comes back as
// an array, but one-to-one -- a foreign key that's also unique, like
// rns_listings' movie_id primary key -- comes back as a single object or
// null. Calling .length on the latter threw on null (crashing
// removeUnreleasableMovies, and with it every scrape-rns run, with a 500)
// and read undefined on an object (so browse treated RNS-listed movies as
// unlisted). Accepts either shape so callers don't have to know which.
export function hasEmbeddedRow(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}
