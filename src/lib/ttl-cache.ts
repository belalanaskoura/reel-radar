// Process-local, in-memory TTL cache for small, slow-changing reads hit on
// every request of a hot path (e.g. the price template read on every
// /movies/[id] view). NOT a distributed cache -- each Vercel serverless
// instance holds its own copy, so a write elsewhere (the admin editing
// scene_price_templates) can take up to `ttlMs` to be reflected on a given
// instance. Fine for admin-maintained reference data that changes rarely
// and where a few minutes of staleness is a non-issue; never use this for
// per-user or security-sensitive data.
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

// Collapses concurrent misses for the same key into one in-flight fetch,
// so a burst of requests arriving before the first fetch resolves doesn't
// each kick off their own duplicate call.
const inFlight = new Map<string, Promise<unknown>>();

export async function getOrSetCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = store.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = fetcher()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}
