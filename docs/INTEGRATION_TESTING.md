# Integration testing

Unit tests (`src/**/*.test.ts`, run via `npm test`) cover pure functions
only — nothing that touches a database. Real Row Level Security policies,
foreign key cascades, CHECK constraints, and unique indexes only exist
inside Postgres itself; a mocked Supabase client can't catch a bug in any
of them, because the policy/constraint logic never actually runs. This
suite (`scripts/integration/**/*.test.ts`, run via `npm run
test:integration`) runs those exact real checks against a real Postgres
instance.

It shares its dedicated test Supabase project with
[`docs/LOAD_TESTING.md`](LOAD_TESTING.md) — one setup covers both. If
you've already followed that doc's setup steps, you have everything this
one needs too, plus one extra key (the anon key).

## Why this needs a separate project from production

`scripts/_lib/test-project-client.ts` reads a dedicated `SUPABASE_TEST_URL`
/ `SUPABASE_TEST_ANON_KEY` / `SUPABASE_TEST_SERVICE_ROLE_KEY` trio from
`.env.test.local` — never `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from
`.env.local`, which is what the real app and every other script in this
repo use. This suite creates and deletes real `auth.users` accounts and
writes real rows to `watchlist`, `notification_log`,
`notification_deliveries`, `cinema_follows`, `push_subscriptions`, and
`feedback` — the opposite of what should ever touch production data. The
client helper refuses to run at all without the test trio configured, and
separately refuses if the test URL happens to match production's.

## One-time setup

If you already set up a test project for load testing, skip to step 3.

1. Create a dedicated test Supabase project (see `docs/LOAD_TESTING.md`
   step 1).
2. Apply this repo's schema to it (see `docs/LOAD_TESTING.md` step 2).
3. Add the anon key to `.env.test.local` (Project Settings → API →
   `anon` `public` key), alongside the URL and service role key it
   already has:
   ```
   SUPABASE_TEST_URL=https://your-test-project.supabase.co
   SUPABASE_TEST_ANON_KEY=your-test-project-anon-key
   SUPABASE_TEST_SERVICE_ROLE_KEY=your-test-project-service-role-key
   ```
4. In the test project's Authentication settings, turn **off** "Confirm
   email" (Authentication → Providers → Email → Confirm email), or every
   `createTestUser()` call will need a real confirmation step it has no
   way to complete. This mirrors the same setting this project's own
   `.env.local`-backed dev environment already runs with off, per
   CLAUDE.md's Phase 3 notes — just don't forget to leave production's
   own copy of this setting ON, since these are two fully independent
   projects.

## Running

```
npm run test:integration
```

Runs with a longer default timeout than unit tests (20s per test, see
`vitest.integration.config.ts`) since every test makes real network round
trips, and with file-level parallelism disabled, since test files within
this suite create/sign-in-as/delete real shared state and running them
concurrently would risk one file's cleanup racing another file's setup
against the same project.

Every test file cleans up its own users/movies/branches in `afterAll`,
including on a thrown setup error (the fixture helpers in
`scripts/integration/_lib/fixtures.ts` accept `undefined` and no-op, so a
`beforeAll` failure doesn't cascade into a second, more confusing crash
in cleanup). If a run is interrupted before cleanup runs, test users are
named `inttest-<timestamp>-<random>-user-N@example.invalid` and test
movies/branches are titled/prefixed the same way — safe to delete by hand
via the test project's dashboard, since nothing in that project matters
outside these test runs.

## What's covered so far

`scripts/integration/rls/` — one file per RLS-enabled table, each signing
in as two (or more) real distinct users and verifying the policy actually
blocks cross-user reads/writes, not just that its SQL text looks correct:

- **`watchlist.test.ts`** — the four-separate-policies (select/insert/
  update/delete) shape.
- **`notification_log.test.ts`** — a more complex table: service-role-only
  inserts (RLS blocks a user inserting their own notification row
  directly — the app's notify functions do this via the service-role
  client, not the user's own session), the real `kind` CHECK constraint
  (this table has a documented history of a real production bug where an
  out-of-range value was silently rejected and swallowed by a best-effort
  `catch {}` — see CLAUDE.md's cinema-lineup-notifications section), and
  both partial unique indexes.
- **`cinema_follows.test.ts`** / **`push_subscriptions.test.ts`** — the
  single combined `for all` policy shape, plus (for push_subscriptions)
  verifying its `(user_id, endpoint)` unique constraint is scoped per
  user, not globally unique on endpoint alone.
- **`feedback.test.ts`** — the interesting negative case: this table has
  an insert policy but genuinely no select policy at all, so even the
  user who submitted feedback can't read it back through RLS. Easy to get
  backwards by accident in a future migration, since a *missing* policy
  doesn't show up as a diff the way a wrong one would.
- **`profiles.test.ts`** — rows created by the `handle_new_user` trigger
  on real signup, not by direct app inserts; select-own/update-own only,
  no insert/delete policy to test.

## Not yet covered (future follow-ups, not started)

Flagged during scoping but deferred to keep this pass focused on RLS:

- **RPC functions and triggers** — `check_rate_limit`,
  `prune_notification_deliveries`, `prune_analytics_events`, the
  `set_was_ever_bookable` trigger on `showtimes_cache`. Real DB-side
  logic with no JS equivalent a unit test could exercise.
- **Matching/scraping pipeline against real tables** — `find-existing-
  movie`, `merge-scene-duplicates`, `notify-cinema-lineup`'s dedupe
  logic. Per CLAUDE.md's history, several real bugs in this area were
  only ever caught by live production runs, never by an automated test.
- **Unique-constraint race-condition recovery** — the documented
  `movie_branch_slugs UNIQUE(branch_id, slug)` race-recovery path
  (`23505`-catch-and-adopt logic in `scrape-scene`/`scrape-vox`) — would
  need two concurrent inserts racing for real, not just a single insert
  hitting the constraint.
