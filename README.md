# ReelRadar

A watchlist app for Egypt cinemas: browse everything bookable now or
coming soon across **Scene Cinemas** (Cairo Festival City, District 5)
and **VOX Cinemas** (Mall of Egypt, City Center Alexandria, City Centre
Almaza), watchlist a title before it's even listed, and get notified the
moment tickets go on sale — by email and/or browser push — with a link
straight to booking.

Live at: _https://reelradar.online_

## Why this exists

Cinemas don't notify you when booking opens for a movie you're waiting
on. This app polls on your behalf and notifies you the instant a
watchlisted title becomes bookable, so you stop manually refreshing
their site. It started as a personal script that checked one cinema
branch for one movie; this is the general version.

## How it works

- **Movie catalog** comes from [TMDB](https://www.themoviedb.org/),
  filtered to titles a real Egypt-based distributor has actually
  released before (or that clear a popularity safety net) — see
  [`src/lib/matching/egypt-distributor-filter.ts`](src/lib/matching/egypt-distributor-filter.ts).
  Movies whose release date has long passed with no real listing
  anywhere are cleaned up automatically
  ([`src/lib/matching/remove-unreleasable.ts`](src/lib/matching/remove-unreleasable.ts)).
- **Release dates and posters** prefer [elCinema](https://elcinema.com)
  over TMDB when elCinema has a record of the movie — TMDB's own release
  date can land on an unrelated country's date when it has no Egypt
  entry. Each cinema's own site is a further poster fallback for movies
  neither TMDB nor elCinema has an image for.
- **Scene showtimes** are scraped directly from Scene's own site
  ([`src/lib/scene/fetcher.ts`](src/lib/scene/fetcher.ts)), grouped by
  format (Standard, Premiere, IMAX, etc.) per branch.
- **VOX showtimes** come from elCinema instead of VOX's own site, which
  sits behind bot protection that blocks direct scraping —
  [`src/lib/elcinema/vox-showtimes.ts`](src/lib/elcinema/vox-showtimes.ts)
  pulls real per-day format/time/price detail for all three VOX
  branches. Booking links point at VOX's real per-branch showtime pages,
  not just its homepage.
- **Ticket prices** are shown per format on the showtime picker and seat
  page. VOX prices come straight from elCinema (already scraped
  alongside showtimes). Scene doesn't expose price anywhere in its own
  scraped data — it only surfaces after a seat is locked into a live
  booking session — so Scene prices are admin-maintained templates
  (per branch and format) instead, spot-checked periodically against a
  real live read to catch drift; see
  [`src/lib/scene/price-template.ts`](src/lib/scene/price-template.ts).
- **Title matching** links each cinema's own listings to the right TMDB
  entry: English search first, Arabic fallback on zero results,
  disambiguation via a confirmed Egypt theatrical release date when a
  title collides with another movie of the same name. Anything that
  can't be resolved confidently is left `unmatched`/`ambiguous`, never
  auto-picked.
- **Polling scales with watchlist size, not user count** — the poll job
  only re-checks (movie, branch) pairs that at least one user is
  watching, so cost stays flat as the user base grows.
- **Notifications** go out over two independent channels: email (via
  [Resend](https://resend.com)) and browser push (Web Push API, opt-in,
  one subscription per device). Either channel failing doesn't block the
  other. A movie notifies once per bookable "episode" — if it goes
  not-bookable and later reopens, watchers are notified again.
- **In-app feedback** (`/feedback`) — saved to the database and emailed
  directly to the maintainer.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) + Tailwind CSS v4
- **Supabase** — Postgres, Auth (email/password and Google OAuth), Row
  Level Security
- **TMDB API** — movie catalog, cast/crew, release dates
- **elCinema**, **Scene Cinemas** — scraped directly (see
  [`src/lib/elcinema/`](src/lib/elcinema/) and
  [`src/lib/scene/`](src/lib/scene/))
- **Resend** — transactional email for notifications and feedback
- **web-push** (Web Push API + VAPID) — browser push notifications, no
  third-party push service or app install required
- **cheerio** for HTML parsing, **Playwright** for browser-driven
  verification during development

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in real values, see below
npm run dev
```

The app expects a Supabase project with a matching schema. Schema
changes aren't tracked as migration files in this repo — they're applied
directly via Supabase's SQL Editor. If you're standing up a fresh
project, you'll need to create the core tables yourself: `movies`,
`branches`, `movie_branch_slugs`, `showtimes_cache`, `watchlist`,
`notification_log`, `profiles`, `push_subscriptions`, `feedback`,
`egypt_releases`, `egypt_distributors`, `scene_price_templates`.

### Environment variables

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/publishable key (public, RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only, bypasses RLS — used by the scheduled jobs and sync scripts. Never expose to the client. |
| `TMDB_API_KEY` | [TMDB API](https://www.themoviedb.org/settings/api) key |
| `SYNC_SECRET` | Shared secret required (via `x-sync-secret` header) to call the scheduled job routes below |
| `RESEND_API_KEY` | [Resend API](https://resend.com/api-keys) key, used to send email notifications and feedback |
| `RESEND_FROM_EMAIL` | Verified sending address for Resend (needs a domain-verified sender in production — see Known limitations) |
| `FEEDBACK_TO_EMAIL` | Address that receives submissions from `/feedback` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key (public), used by the browser to subscribe to push |
| `VAPID_PRIVATE_KEY` | VAPID private key, server-only — used to sign push messages. Generate a pair with `npx web-push generate-vapid-keys`. Never expose to the client. |
| `ADMIN_EMAILS` | Comma-separated allowlist of emails permitted to view `/admin` |

Google sign-in is configured entirely in the Supabase dashboard
(Authentication → Providers → Google) and the corresponding Google Cloud
OAuth client — no additional env vars in this repo.

## Scheduled jobs

These are plain API routes, not Vercel Cron — Vercel's Hobby tier caps
cron at once/day with up to ±59 min jitter, too coarse for this app's
polling needs. Instead, each route is secret-header-protected and meant
to be called on a real interval by an external scheduler (e.g.
[cron-job.org](https://cron-job.org)):

| Route | Purpose | Suggested interval |
|---|---|---|
| `POST /api/sync-movies` | Pulls upcoming movies from TMDB into the catalog | Daily |
| `POST /api/scrape-scene?branch=<id>` | Scrapes a Scene branch's listings and bookability | Every 15–30 min per branch |
| `POST /api/scrape-scene-delist` | Clears bookability for Scene movies no longer listed at all | Every 15–30 min |
| `POST /api/scrape-vox` | Scrapes VOX showtimes (via elCinema) for all 3 branches, including delisting movies whose run has ended | Daily (full-detail fetch, more expensive per run) |
| `POST /api/scrape-formats` | Records which showtime formats (Standard, IMAX, etc.) are available per Scene branch, for `/cinemas` | Every 30 min |
| `POST /api/match-movies` | Matches new listings to TMDB entries | After each scrape run |
| `POST /api/poll` | Checks bookability for watched (movie, branch) pairs and notifies | Every 15–30 min |
| `POST /api/admin-digest` | Emails/pushes a data-quality summary to admins (missing posters, stuck matches, price drift) | Daily |
| `POST /api/check-scene-prices?branch=<id>&format=<name>` | Spot-checks one Scene branch+format's admin-maintained price template against a real live read | Daily per branch+format combo |

Each requires an `x-sync-secret: <SYNC_SECRET>` header. Example:

```bash
curl -X POST https://reelradar.online/api/poll \
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
- `backfill-movie-posters.ts` / `backfill-movie-posters-scene.ts` — fills
  in missing posters from elCinema, then Scene Cinemas, for existing
  movies that have neither a TMDB nor (in the first script's case) an
  elCinema poster.
- `cleanup-distributor-filter.ts` — retroactively re-checks the catalog
  against a tightened distributor allowlist.

## Known limitations

- **VOX isn't scraped directly**: VOX's own site sits behind bot
  protection that blocks direct fetching and headless-browser scraping
  alike. Showtimes instead come from elCinema, which has real per-branch
  listings for all 3 VOX branches — a reliable substitute, not a
  workaround with reduced accuracy.
- **Arabic-title matching gap**: a cinema sometimes lists a movie only
  under an English transliteration of its Arabic title, and elCinema may
  use a different transliteration for the same film. Title matching
  requires an exact normalized match as a safety guard against wrong
  matches, so these can land as `unmatched` even when both sources have
  the movie.
- **Distributor allowlist is strict, not permissive**: a movie with no
  popularity signal and no matched distributor history is excluded from
  the catalog outright, not shown with a lower-confidence label. This
  trades some false negatives (a genuinely Egypt-bound release from a
  brand-new distributor) for a cleaner catalog.
- **Scraping is best-effort**: both elCinema and Scene Cinemas are
  scraped directly from their public HTML, not an official API. Markup
  changes on either site can break parsing until the relevant selector
  is updated.

