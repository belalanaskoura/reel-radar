# Load and stress testing

Two kinds of test live under `scripts/stress/`, split by whether they
touch a real database:

- **Synthetic** (`*.mjs`) — no network, no DB, run with plain `node`.
  Simulate an algorithmic shape (a fan-out loop's concurrency pattern, a
  UI component's row-bucketing cost) with fake delays/data to isolate
  whether the *shape* of the code scales, independent of any real
  service's behavior that day.
- **Real Supabase** (`*.ts`, run with `npx tsx`) — seed real rows into a
  real Postgres instance and measure real query/write latency. These
  answer a different question than the synthetic scripts: not "does this
  algorithm scale" but "does Supabase's free tier, this schema, and these
  indexes actually hold up at N rows or M concurrent writers."

## Running the synthetic scripts

No setup needed:

```
node scripts/stress/notification-fanout.mjs
node scripts/stress/row-bucketing-complexity.mjs
```

## Running the real-Supabase scripts

These require a **dedicated test Supabase project** — never production.
`scripts/stress/_lib/test-project-client.ts` refuses to run at all
without one, and separately refuses if the test project's URL happens to
match production's, as a second guard against a copy-paste mistake.

### One-time setup

1. Create a new, separate Supabase project (supabase.com dashboard → New
   Project). Free tier is fine — this project only ever holds throwaway
   load-test data. Name it something unambiguous, e.g.
   `reelradar-loadtest`.
2. Apply this repo's schema to it. Since Phase 4, this project has no
   `.sql` migration files to run in order by hand — either:
   - Use the Supabase CLI's `db push` against the new project with the
     files under `supabase/schemas/`, or
   - Open each file under `supabase/schemas/public/tables/` (and
     `functions/`) in the new project's SQL Editor and run them in
     dependency order (tables referenced by a foreign key before the
     table that references them), then apply
     `supabase/migrations/*.sql` in filename order on top.
3. Copy the new project's URL and **service role** key (Project Settings
   → API) into a new `.env.test.local` file at the repo root:
   ```
   SUPABASE_TEST_URL=https://your-test-project.supabase.co
   SUPABASE_TEST_SERVICE_ROLE_KEY=your-test-project-service-role-key
   ```
   This file is already covered by `.gitignore`'s `.env*` pattern — never
   commit it, and never reuse production's service role key here.

### Running

```
npx tsx scripts/stress/browse-query-scale.ts
npx tsx scripts/stress/concurrent-write-load.ts
```

Both scripts:

- Tag every row they create with a run-specific prefix (`loadtest-<timestamp>`
  in the title/email), so a run that's killed mid-way can be cleaned up by
  hand via that prefix if the script's own `finally`-block cleanup didn't
  get to run.
- Delete everything they created at the end of a normal run, including
  the throwaway `auth.users` accounts `concurrent-write-load.ts` creates
  (via the admin API — cascades to any rows referencing them).
- Print a plain results table to stdout; there's no separate report file.

### What each one measures

- **`browse-query-scale.ts`** — seeds synthetic `movies`/`showtimes_cache`
  rows (no real user accounts needed, since neither table has an
  `auth.users` FK) at increasing scale, and times the *exact* query
  `src/app/browse/page.tsx` runs, plus a plain `branch_id`-filtered
  `showtimes_cache` query. Targets
  [`docs/SCALABILITY_AUDIT.md`](SCALABILITY_AUDIT.md) findings 7 and 10.
- **`concurrent-write-load.ts`** — creates a small pool of real throwaway
  users (needed because `notification_log`/`notification_deliveries`
  both FK to `auth.users`), then writes each user's notification records
  through the same `mapWithConcurrency` shape `notifyWatchers` uses in
  production, at increasing concurrency, to check for real lock
  contention or a throughput cliff under concurrent writes — a question
  the synthetic `notification-fanout.mjs` script can't answer since it
  never touches a database. Targets the concurrent-write half of the
  load-testing scope; see `docs/SCALABILITY_AUDIT.md` finding 1's
  "Update" section for the concurrency-shape context.

### Cost and cleanup

Running these repeatedly on the free tier is fine — row counts stay
bounded (the scripts clean up after themselves) and Supabase's free tier
has no request-based billing that would make repeated runs costly. If a
run is interrupted (Ctrl-C, crash) before its cleanup step, search the
test project's tables for rows with a `loadtest-` prefix and delete them
by hand; nothing in that project matters outside these test runs, so
there's no risk in being aggressive about it.
