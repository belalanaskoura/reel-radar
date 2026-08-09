# ReelRadar

A watchlist app for [Scene Cinemas](https://cfc.scenecinemas.com) (Cairo
Festival City and District 5): browse everything bookable now or coming
soon, watchlist a title before it's even listed, and get notified by email
(and optionally push) the moment tickets go on sale — with a link straight
to booking.

Live at: _https://reelradar.online_

## Why this exists

Cinemas doesn't notify you when booking opens for a movie you're
waiting on. This app polls on your behalf and pushes a
notification the instant a watchlisted title becomes bookable, so you
stop manually refreshing their site.

## How it works

- **Movie catalog** comes from [TMDB](https://www.themoviedb.org/), filtered
  to titles a real Egypt-based distributor has actually released before (or
  that clear a popularity safety net) — see
  [`src/lib/matching/egypt-distributor-filter.ts`](src/lib/matching/egypt-distributor-filter.ts).
- **Release dates and posters** prefer [elCinema](https://elcinema.com) over
  TMDB when elCinema has a record of the movie — TMDB's own release date can
  land on an unrelated country's date when it has no Egypt entry. Scene
  Cinemas' own page is a further poster fallback for movies neither TMDB nor
  elCinema has an image for.
- **Showtimes** are scraped directly from Scene's own site
  ([`src/lib/scene/fetcher.ts`](src/lib/scene/fetcher.ts)), grouped by
  format (Standard, Premiere, IMAX, etc.) per branch.
- **Title matching** links Scene's own listings to the right TMDB entry:
  English search first, Arabic fallback on zero results, disambiguation via
  a confirmed Egypt theatrical release date when a title collides with
  another movie of the same name. Anything that can't be resolved
  confidently is left `unmatched`/`ambiguous`, never auto-picked.
- **Polling scales with watchlist size, not user count** — the poll job
  only re-checks (movie, branch) pairs that at least one user is watching,
  so cost stays flat as the user base grows.
- **Notifications** go out over two independent channels: email (via
  [Resend](https://resend.com), automatic for every account, no setup) and
  browser push (Web Push API, opt-in, one subscription per device). Either
  channel failing doesn't block the other.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) + Tailwind CSS v4
- **Supabase** — Postgres, Auth (email/password and Google OAuth), Row
  Level Security
- **TMDB API** — movie catalog, cast/crew, release dates
- **elCinema** and **Scene Cinemas** — scraped directly (see
  [`src/lib/elcinema/`](src/lib/elcinema/) and [`src/lib/scene/`](src/lib/scene/))
- **Resend** — transactional email for the always-on notification channel
- **web-push** (Web Push API + VAPID) — optional browser push notifications,
  no third-party push service or app install required
- **cheerio** for HTML parsing, **Playwright** for browser-driven
  verification during development

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in real values, see below
npm run dev
```

The app expects a Supabase project with the schema described in
`CLAUDE.md`'s phase notes (not tracked as migration files in this repo —
schema changes are applied directly via Supabase's SQL Editor and recorded
in prose). If you're standing up a fresh project, you'll need to create the
tables described there before the app will run against it.

### Environment variables

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key (public, RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only, bypasses RLS — used by the scheduled jobs and sync scripts. Never expose to the client. |
| `TMDB_API_KEY` | [TMDB API](https://www.themoviedb.org/settings/api) key |
| `SYNC_SECRET` | Shared secret required (via `x-sync-secret` header) to call the scheduled job routes below |
| `RESEND_API_KEY` | [Resend API](https://resend.com/api-keys) key, used to send the always-on email notification |
| `RESEND_FROM_EMAIL` | Verified sending address for Resend (needs a domain-verified sender in production) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key (public), used by the browser to subscribe to push |
| `VAPID_PRIVATE_KEY` | VAPID private key, server-only — used to sign push messages. Generate a pair with `npx web-push generate-vapid-keys`. Never expose to the client. |

Google sign-in is configured entirely in the Supabase dashboard (Authentication → Providers → Google) and the corresponding Google Cloud OAuth client — no additional env vars in this repo.

## Scheduled jobs

These are plain API routes, not Vercel Cron — Vercel's Hobby tier caps cron
at once/day with up to ±59 min jitter, too coarse for this app's polling
needs. Instead, each route is secret-header-protected and meant to be
called on a real interval by an external scheduler (e.g.
[cron-job.org](https://cron-job.org)):

| Route | Purpose | Suggested interval |
|---|---|---|
| `POST /api/sync-movies` | Pulls upcoming movies from TMDB into the catalog | Daily |
| `POST /api/scrape-scene` | Scrapes both Scene branches' listings and bookability | Every 15–30 min |
| `POST /api/match-movies` | Matches new Scene listings to TMDB entries | After each scrape-scene run |
| `POST /api/poll` | Checks bookability for watched (movie, branch) pairs and notifies | Every 15–30 min |

Each requires an `x-sync-secret: <SYNC_SECRET>` header. Example:

```bash
curl -X POST https://your-deployment.vercel.app/api/poll \
  -H "x-sync-secret: $SYNC_SECRET"
```

## One-off scripts

Run locally with `npx tsx scripts/<name>.ts` — these are historical
backfills / corrections, not part of the regular scheduled-job loop:

- `backfill-egypt-releases.ts` — scrapes ~4 years of elCinema's Egypt box
  office history to build the distributor allowlist and release-date
  ground truth.
- `backfill-movie-release-dates.ts` — re-checks existing movies against
  elCinema and corrects release dates that predate the elCinema-preferred
  pipeline.
- `backfill-movie-posters.ts` / `backfill-movie-posters-scene.ts` —
  fills in missing posters from elCinema, then Scene Cinemas, for existing
  movies that have neither a TMDB nor (in the first script's case) an
  elCinema poster.

## Known limitations

- **Arabic-title matching gap**: Scene sometimes lists a movie only under
  an English transliteration of its Arabic title (e.g. "Khali Balak Min
  Nafsik"), and elCinema may use a different transliteration for the same
  film (e.g. "Khally Balak Min Nafsak"). Title matching requires an exact
  normalized match as a safety guard against wrong matches, so these can
  land as `unmatched` even when both sources have the movie.
- **Distributor allowlist is strict, not permissive**: a movie with no
  popularity signal and no matched distributor history is excluded from
  the catalog outright, not shown with a lower-confidence label. This
  trades some false negatives (a genuinely Egypt-bound release from a
  brand-new distributor) for a cleaner catalog.
- **Scraping is best-effort**: both elCinema and Scene Cinemas are scraped
  directly from their public HTML, not an official API. Markup changes on
  either site can break parsing until the relevant selector is updated.
- **Email requires a verified sending domain**: Resend's test sender only
  delivers to the Resend account's own signup address, so real email
  notifications need `RESEND_FROM_EMAIL` on a domain that's passed Resend's
  DNS verification (SPF/DKIM/MX). Until that's set up, email notifications
  won't reach real users' inboxes. A custom domain has been purchased for
  this purpose; verification is in progress but not yet complete.

## Development notes

`CLAUDE.md` (gitignored, local-only) holds the full phase-by-phase build
history and working agreement for this project — architecture decisions,
what was tried, what broke, and why. It isn't tracked in this repo since
it's local project memory rather than project documentation, but if you're
picking up this codebase fresh, ask whoever has been working on it for the
context it contains.
