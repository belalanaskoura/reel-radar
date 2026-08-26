# Scalability audit (2026-08-26)

Point-in-time audit of ReelRadar's scalability posture, done at ~20 real
users and ~100-300 movies in the catalog. Every finding below is cited
against real code (file:line) or, where noted, a synthetic local stress
test — nothing here was tested against production Supabase, real Scene/
VOX/TMDB/elCinema traffic, or real Resend/push sends. Where a number is
estimated rather than measured, it's labeled as an estimate.

None of these are live incidents today. This is a forward-looking list of
what would need attention as user count and catalog size grow, ranked
roughly by how soon each would actually bite.

## Summary

| # | Finding | Confirmed via | Rough threshold |
|---|---|---|---|
| 1 | ~~Notification fan-out loops are fully sequential, no concurrency cap~~ **FIXED 2026-08-27** | Code + stress test | Was ~50 watchers exceeding cron-job.org's 30s timeout; now ~350-380 at concurrency=10 |
| 2 | `notify-cinema-lineup.ts` runs inline inside scrape jobs (concurrency fixed, architecture unchanged) | Code | Inner loop no longer sequential (see #1), but scrape job runtime is still coupled to follower count, not backgrounded |
| 3 | `analytics_events` retention function exists but is never invoked | Code (grep, zero call sites) | Unbounded growth against Supabase's 500MB free-tier cap, no defined date |
| 4 | `notification_deliveries` has no retention at all | Code | Fastest-growing table in the schema; fine today, no cleanup story |
| 5 | `scrape-scene` needs a manually-added cron-job.org job per ~10 new listings | Code comment + CLAUDE.md history | Already crossed once at 22 listings; recurs as catalog grows |
| 6 | `match-movies` has no batching/timeout safety net (unlike `scrape-scene`) | Code | Same failure mode as #5, waiting to happen on a large unmatched backlog |
| 7 | Browse page ships the entire catalog + filters client-side, no pagination | Code comment (limit deliberately set above expected catalog size) | Payload/filter-cost growth tracks catalog size directly |
| 8 | `useEqualRowHeights`'s row-bucketing is O(cards²) | Code + stress test | Bounded today by `PAGE_SIZE=60`; would matter if that cap is ever raised |
| 9 | No rate-limit/backoff handling for TMDB, Resend, or web-push | Code (grep, zero matches) | Speculative; no evidence of being hit yet |
| 10 | ~~Two minor missing indexes (`watchlist.movie_id`, `showtimes_cache.branch_id`)~~ **FIXED 2026-08-27** | Schema read | Both added via `supabase/migrations/0102_scale_indexes.sql` |
| 11 | ~~`mapWithConcurrency` exists but is duplicated twice and unused by any notification path~~ **FIXED 2026-08-27** | Code | Extracted to `src/lib/concurrency.ts` (with its own unit tests) and applied at every fan-out call site: `poll`, `notify-cinema-lineup`, `notify-new-releases`, `sendBroadcast`, `welcome-email`, `sync-movies`, `match-to-tmdb` |

---

## 1. Sequential, uncapped per-user notification loops

The app's core scaling promise (stated in CLAUDE.md) is that scraping/
polling cost scales with distinct **watched movies**, never with **user**
count. That promise holds for the outer poll loop
(`src/app/api/poll/route.ts`), but every notification fan-out function
nested inside it loops per-user with fully sequential `await`s and no
concurrency cap:

- `notifyWatchers` (`src/app/api/poll/route.ts:145-260`) — up to 6
  sequential awaits per watcher (profile select, email send, delivery
  insert, push send, delivery insert, log insert).
- `notifyLineupAdditions` / `notifyLineupRemovals`
  (`src/lib/matching/notify-cinema-lineup.ts:57-138`, `183-261`) — nested
  `for (follower) { for (movie) { ...6 awaits... } }`, so O(followers ×
  movies), invoked inline from scrape/delist jobs (see finding 2).
- `notifyNewReleases` (`src/lib/matching/notify-new-releases.ts:50-98`) —
  same shape, 4 awaits per row.
- `sendBroadcast` (`src/app/admin/broadcast/actions.ts:97-154`) — same
  shape, and this one runs synchronously inside a single admin server
  action request, not a background job.
- `/api/welcome-email` (`src/app/api/welcome-email/route.ts:89-126`) —
  same shape; the file's own comment already documents this sequential
  slowness as the root cause of a real production incident (a run blew
  past cron-job.org's 30s timeout, triggering an overlapping retry that
  sent 18/18 users a duplicate welcome email, repeated over 3 days before
  being fixed with a DB-level unique-constraint claim). **The race was
  fixed; the underlying sequential-loop slowness that caused the timeout
  in the first place was not.**

### Stress test

Synthetic, local-only (no network/DB) — simulates the same 6-await shape
`notifyWatchers` uses, with per-call latencies representative of Supabase
(50-150ms), Resend (200-500ms), and web-push (100-300ms) round trips.
Compares the app's actual sequential pattern against a bounded-
concurrency version (concurrency=10, the same cap `sync-movies` already
uses for TMDB calls via its own `mapWithConcurrency`):

| watchers | sequential | concurrency=10 | exceeds cron-job.org 30s? | exceeds Vercel Hobby 10s? |
|---|---|---|---|---|
| 10 | 10.1s | 1.2s | no | **yes** |
| 22 | 21.0s | 3.0s | no | **yes** |
| 50 | 50.0s | 5.4s | **yes** | **yes** |
| 100 | 99.2s | 10.7s | **yes** | **yes** |

At 10 concurrent workers, even 50 watchers finishes comfortably inside
both timeouts. The sequential version is already past Vercel's Hobby
function timeout at just 10 watchers, and past cron-job.org's 30s job
timeout by 50.

This is watcher count **on a single movie/cinema**, not total user count
— and watchlisting/following realistically concentrates on popular
titles rather than spreading evenly, so this threshold is plausible well
before total user count reaches the low thousands.

**Fix shape**: `mapWithConcurrency` already exists in this codebase
(`src/app/api/sync-movies/route.ts:21`, duplicated again in
`src/app/cinemas/[id]/actions.ts:13`) and is exactly the right tool —
it's just never been applied to any notification fan-out path. Worth
extracting to a shared `src/lib/concurrency.ts` once applied to a second
call site, rather than a third copy-paste.

### Update, 2026-08-27: fixed

`mapWithConcurrency` was extracted to `src/lib/concurrency.ts` (own unit
tests in `src/lib/concurrency.test.ts`) and applied at concurrency=10 to
every fan-out path this finding named: `notifyWatchers` (`poll`),
`notifyLineupAdditions`/`notifyLineupRemovals`, `notifyNewReleases`,
`sendBroadcast`, `/api/welcome-email`, plus `sync-movies` and
`match-to-tmdb` (which had their own pre-existing duplicate
implementations, now consolidated onto the same shared function).

`scripts/stress/notification-fanout.mjs` was rewritten to simulate the
*current* concurrency=10 pattern rather than sequential-vs-concurrent
(the comparison this section's table made is no longer the live
question). Rerun at higher scale to find today's real breaking point:

| watchers | wall time | exceeds cron-job.org 30s? | exceeds Vercel Hobby 10s? |
|---|---|---|---|
| 10 | 1.1s | no | no |
| 22 | 2.8s | no | no |
| 50 | 5.5s | no | no |
| 100 | 10.5s | no | **yes** |
| 250 | 25.6s | no | **yes** |
| 400 | 40.1s | **yes** | **yes** |

Concurrency=10 pushes the safe zone from ~10 watchers (the old
sequential number, at Vercel's 10s function timeout) out to roughly
90-95, and the cron-job.org 30s ceiling from ~50 out to roughly
350-380. Vercel Hobby's function timeout is still the tighter of the
two constraints and is now the more relevant one to watch as watcher
counts grow on a single popular title.

---

## 2. Lineup notifications run inline inside scrape jobs

`notifyLineupAdditions`/`notifyLineupRemovals` are called directly from
`scrape-scene`, `scrape-scene-delist`, and `scrape-vox` — not
backgrounded. That means a scrape job's own request duration is coupled
to `followers × newly-added-or-removed-movies` on top of the scrape cost
itself, on the exact route (`scrape-scene`) that has already hit
cron-job.org's 30s timeout once for an unrelated reason (see finding 5).
A mass-delisting event (a run ending for several movies at once) on a
well-followed cinema branch would stack this cost directly onto an
already timeout-sensitive job.

---

## 3. `analytics_events` retention function is defined but never called

`prune_analytics_events(p_keep_days integer default 90)` exists as a real
Postgres function (`supabase/migrations/0101_analytics_retention.sql`,
`supabase/schemas/public/functions/prune_analytics_events.sql`), correctly
permissioned (`service_role`/`postgres` only), and correctly excludes
`admin_digest_run`/`welcome_email_sent` rows (real app state, not
analytics). A repo-wide grep for `prune_analytics_events` finds it only in
its own definition files — no route, no cron job, no `pg_cron` schedule
invokes it anywhere.

The table's *write* side is already rate-limited (`PAGE_VIEW_SAMPLE_RATE
= 0.1`, `src/lib/analytics.ts:88-95`, whose own comment cites the 500MB
Supabase free-tier cap as the reason). The pruning tool meant to bound
what accumulates from that already-throttled inflow is real but dormant.

**Fix shape**: a 7th cron-job.org job hitting a small new route that
calls this function (or a `pg_cron` schedule directly in Supabase, if
available on the free tier) — this is a one-function, low-risk fix, not
a design change.

---

## 4. `notification_deliveries` has no retention at all

Fed by every notify path (poll, lineup, broadcast, new-release) — one row
per user per channel per notification. Has real, correct indexes for its
actual read patterns (`(channel, success)`, `created_at desc` —
`supabase/schemas/public/tables/notification_deliveries.sql:20-22`), and
every read in the app is already window/limit-bounded. But nothing
deletes old rows, unlike `analytics_events` which at least has the tool
(dormant as it is). This is the fastest-growing table in the schema by
construction — every send, on every channel, for every user, forever.

Not urgent at 20 users. Worth a retention policy decision (how long is a
delivery-log row useful for?) before this becomes the largest table in
the database by row count.

---

## 5. `scrape-scene`'s batching already needed a real fix once

`src/app/api/scrape-scene/route.ts`'s own comment documents a real,
already-occurred incident: CFC grew from ~20 to 22+ listings and started
missing cron-job.org's 30s timeout outright, producing a 107-minute gap
in the scrape log before the batching fix (`BATCH_SIZE = 10`, `?offset=`
param, multiple staggered cron-job.org jobs) landed. This isn't a
predicted future problem — it's a threshold this app has already crossed
once, and the fix requires a human to manually add more offset-jobs in
cron-job.org as the catalog keeps growing (nothing dynamic scales the job
count with listing count).

---

## 6. `match-movies` has no equivalent safety net

Unlike `scrape-scene`, `matchScenesToTmdb`
(`src/lib/matching/match-to-tmdb.ts:197-243`) has no `BATCH_SIZE`/offset
pattern — it processes the entire unmatched backlog in one sequential
pass, each movie costing 1-3 external calls (TMDB search, optional
elCinema fallback with its own 1s delays, optional per-candidate
`getEgTheatricalReleaseDate` calls for every ambiguous candidate). If the
unmatched backlog grows faster than it's cleared (plausible if scraping
outpaces matching, e.g. after adding a new branch or chain), this route
is positioned to hit the exact same cron-job.org timeout failure mode
`scrape-scene` already hit — with no batching fix in place yet.

---

## 7. Browse page: whole-catalog fetch, client-side filter, no pagination

`src/app/browse/page.tsx:39-44` fetches up to `limit(2000)` movies in one
query, joined against `showtimes_cache`/`branches`, shipped whole to the
client for `BrowseGrid`'s `useMemo`-based filtering
(`src/components/BrowseGrid.tsx:47-113`). The code's own comment confirms
this limit was deliberately raised **above expected future catalog size**
("now that sync-movies pulls through end of 2029"), not set as a payload
safety cap. Search runs on every keystroke with no debounce, against the
full fetched array, not just visible items.

At today's ~100-300 movies this is genuinely fine — CLAUDE.md's own
"viable at this project's scale (~100 browsable movies)" note is accurate
for the current catalog. The risk is specifically that the `2000` limit
was chosen to track anticipated catalog growth, meaning the payload and
per-keystroke filter cost are expected to grow toward that number over
time by design, not as an accident — worth a pagination pass before the
catalog gets meaningfully larger than it is now, since nothing currently
signals when that threshold is crossed.

### Update, 2026-08-27: limit lowered, pagination still not built

The fetch limit is now `BROWSE_FETCH_LIMIT = 300`
(`src/app/browse/page.tsx`), not the `2000` this finding originally
described — its own comment says it was set relative to a real catalog
size of 117 at the time, with "generous headroom... revisit once the
catalog is materially closer to this," which is a narrower, more
deliberately-bounded number than the original "sized for 2029" framing.
The underlying finding is otherwise unchanged: still a whole-catalog
fetch with no real pagination, still filtered client-side on every
keystroke. `scripts/stress/browse-query-scale.ts` (see finding 10's
update) measures this exact query's real latency up to 10,000 seeded
movies against a test Supabase project, which is useful context for
deciding when a pagination pass actually becomes worth doing — it does
not fix or replace the need for one.

---

## 8. `useEqualRowHeights`'s row-bucketing algorithm is O(cards²)

`src/components/useEqualRowHeights.ts:46` — `[...rows.entries()].find(...)`
does a linear scan of every row bucket found so far, for every card
processed. On a narrow (2-column) layout this approaches true O(N²) since
row count grows almost as fast as card count.

### Stress test

Synthetic, no DOM — isolates just the bucketing algorithm's comparison
count at increasing card counts:

| cards | 2-col comparisons | 6-col comparisons |
|---|---|---|
| 60 (today's `PAGE_SIZE`) | 900 | 320 |
| 120 | 3,600 | 1,240 |
| 500 | 62,500 | 21,000 |
| 2000 | 1,000,000 | 334,000 |

Confirms real quadratic growth (a 33x increase in card count from 60 to
2000 produces a ~1,111x increase in comparisons on the 2-column case, not
a proportional 33x). At today's `PAGE_SIZE = 60` this is trivially cheap
(sub-millisecond). This is not urgent — it's a latent algorithmic issue
that would only start to matter if `PAGE_SIZE` (currently a fixed
constant, not user-configurable) were ever raised substantially, e.g. for
a "load more" or "show all" change.

---

## 9. No rate-limit/backoff handling for external APIs

Grepped for rate-limit/429/backoff handling in `src/lib/tmdb.ts`,
`src/lib/email.ts`, `src/lib/push.ts` — none found. `email.ts` makes one
raw `fetch` per recipient per notification (no Resend batch-send API
usage, despite Resend offering one), with only a 15s abort timeout as its
sole resilience mechanism — no retry, no backoff, no rate-limit-specific
error handling (a 429 is caught by the same generic `!res.ok` → throw as
any other failure). `push.ts` handles expired-subscription cleanup
(404/410) but nothing rate-limit-specific. `tmdb.ts` has no handling at
all beyond `sync-movies`'s `SYNC_CONCURRENCY = 10` cap, which exists for
timeout-avoidance, not documented as a rate-limit accommodation.

This finding is speculative — there's no evidence in the repo that any of
these limits have actually been hit, and Resend/TMDB/web-push's specific
quotas aren't documented anywhere in this codebase. Flagging as a gap
worth having a plan for, not a confirmed problem.

---

## 10. Two indexes worth adding ahead of real growth

- `watchlist` has PK `(user_id, movie_id)`, but `/api/poll`'s
  `notifyWatchers` filters by `movie_id` alone
  (`src/app/api/poll/route.ts:155`) — the non-leading column of that
  composite key. Fine at today's row count (≤ a few thousand); worth a
  secondary index on `movie_id` before `watchlist` grows into the tens of
  thousands of rows.
- `showtimes_cache` has PK `(movie_id, branch_id)`, but the delisting
  sweep in both `scrape-scene-delist` and `scrape-vox` filters by
  `branch_id` first (`.eq('branch_id', ...).eq('bookable', true)`) — also
  the non-leading column. Same "fine today, worth adding before it
  matters" status; this one runs on every scheduled delist sweep
  regardless of load, so it's a better early candidate than `watchlist`'s.

Not urgent. Everything else checked (`movie_branch_slugs`,
`notification_log`, `notification_deliveries`, `analytics_events`) has
real, correctly-targeted indexes already.

### Update, 2026-08-27: fixed

Both indexes were added via `supabase/migrations/0102_scale_indexes.sql`:
`watchlist_movie_id_idx` on `watchlist (movie_id)` and
`showtimes_cache_branch_id_idx` on `showtimes_cache (branch_id, bookable)`
(a composite covering the delisting sweep's exact filter shape, not just
`branch_id` alone). `scripts/stress/browse-query-scale.ts` seeds
synthetic rows in a dedicated test Supabase project at increasing scale
(up to 10,000 movies) and times both the real browse-page query and a
plain `branch_id` filter query against it, to confirm these indexes hold
up under load rather than just trusting they were applied correctly —
see `docs/LOAD_TESTING.md` for how to run it.

---

## 11. The fix for findings 1 and 2 already exists in this codebase

`mapWithConcurrency` is implemented twice, independently
(`src/app/api/sync-movies/route.ts:21`,
`src/app/cinemas/[id]/actions.ts:13`), both times to bound concurrent
TMDB calls. It was never applied to any of the notification fan-out
functions in findings 1-2, despite those having the exact same shape
(many independent, slow, external I/O calls per invocation). This isn't a
new pattern to invent — it's a known-working pattern in this codebase
that just needs to be reused in three or four more places, and extracted
to a shared module once it's used a third time.

### Update, 2026-08-27: fixed

See finding 1's update — `mapWithConcurrency` is now a single shared
implementation (`src/lib/concurrency.ts`) applied everywhere this finding
flagged.

---

## What this audit did not cover

Per the scope agreed before starting: no writes or load generated against
real production Supabase, Scene/VOX cinema sites, TMDB, elCinema, Resend,
or web-push. Two things worth a follow-up if deeper verification is
wanted later:

- Real row counts and `EXPLAIN ANALYZE` output against the actual
  production tables named in finding 10, to confirm the index gaps are
  real at current scale (read-only, would need explicit go-ahead).
- Whatever Supabase's actual free-tier limits are beyond the 500MB
  storage cap already documented in-repo (connection limits, auth MAU
  cap, egress) — not captured anywhere in this codebase, would need to be
  checked against Supabase's own current published limits.
