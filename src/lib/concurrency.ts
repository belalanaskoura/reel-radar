// Runs `fn` over `items` with at most `size` in flight at once, preserving
// input order in the returned results -- neither fully sequential (slow,
// and the root cause of real timeout/duplicate-send incidents in this app's
// history: see /api/welcome-email and scrape-scene's own comments) nor
// fully concurrent (a burst that can hammer an external site or trip a
// provider's rate limit). Originally written independently in sync-movies
// and cinemas/[id]/actions.ts for TMDB/Scene calls; extracted here once a
// third caller (the notification fan-out paths) needed the same shape.
export async function mapWithConcurrency<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}
