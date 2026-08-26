/**
 * One-off backfill: scrapes elCinema's Egypt box office listings for the
 * last 4 years, matches each unique movie to TMDB (IMDb ID first --
 * elCinema links IMDb on most work pages, an exact cross-reference, no
 * fuzzy title matching needed -- falling back to Phase 5's title-search
 * pipeline for the ones without one), and populates `egypt_releases` +
 * `egypt_distributors`. Run once with `npx tsx scripts/backfill-egypt-releases.ts`,
 * or re-run occasionally to refresh -- it's idempotent (upserts on
 * elcinema_id, recomputes egypt_distributors from scratch each run).
 *
 * Not an API route: this is a historical backfill, not part of the
 * regular poll/sync loop, so there's no reason to fit it inside Vercel's
 * function duration limits.
 *
 * Dry run by default -- scrapes and matches as normal but skips both
 * upsert loops (egypt_releases, egypt_distributors), so the summary
 * counts reflect what *would* be written. Run with
 * `npx tsx scripts/backfill-egypt-releases.ts --live` to actually apply.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { isDryRun, logDryRunBanner } from './_lib/dry-run';

const envPath = path.resolve(__dirname, '../.env.local');
fs.readFileSync(envPath, 'utf8')
  .split('\n')
  .forEach((line) => {
    const [k, ...v] = line.split('=');
    if (k) process.env[k] = v.join('=');
  });

import {
  fetchBoxOfficeWeek,
  fetchWorkDetails,
  sleep,
  REQUEST_DELAY_MS,
} from '../src/lib/elcinema/fetcher';
import { findByImdbId, fetchMovieDetails } from '../src/lib/tmdb';
import { findTmdbMatch } from '../src/lib/matching/match-to-tmdb';

const YEARS_BACK = 4;
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_WEEK = getIsoWeek(new Date());

function getIsoWeek(date: Date): number {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.round((firstThursday - target.valueOf()) / (7 * 24 * 3600 * 1000));
}

async function main() {
  logDryRunBanner('backfill-egypt-releases');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  console.log(`Scraping elCinema Egypt box office: ${YEARS_BACK} years back from ${CURRENT_YEAR} week ${CURRENT_WEEK}`);

  const uniqueMovies = new Map<number, string>();

  for (let yearsAgo = 0; yearsAgo < YEARS_BACK; yearsAgo++) {
    const year = CURRENT_YEAR - yearsAgo;
    const maxWeek = yearsAgo === 0 ? CURRENT_WEEK : 52;
    for (let week = 1; week <= maxWeek; week++) {
      try {
        const entries = await fetchBoxOfficeWeek(year, week);
        for (const entry of entries) {
          if (!uniqueMovies.has(entry.elcinemaId)) {
            uniqueMovies.set(entry.elcinemaId, entry.title);
          }
        }
        if (week % 10 === 0 || week === maxWeek) {
          console.log(`  ${year} week ${week}: ${uniqueMovies.size} unique movies so far`);
        }
      } catch (err) {
        console.warn(`  ${year} week ${week}: failed (${(err as Error).message})`);
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(`\nFound ${uniqueMovies.size} unique movies across ${YEARS_BACK} years. Fetching details...`);

  let matched = 0;
  let unmatched = 0;
  let processed = 0;

  for (const [elcinemaId, listingTitle] of uniqueMovies) {
    processed += 1;
    try {
      const { data: existing } = await supabase
        .from('egypt_releases')
        .select('id, match_status')
        .eq('elcinema_id', elcinemaId)
        .maybeSingle();

      if (existing?.match_status === 'matched') {
        matched += 1;
        continue; // already matched in a previous run, skip re-fetching
      }

      const details = await fetchWorkDetails(elcinemaId);
      await sleep(REQUEST_DELAY_MS);

      let tmdbId: number | null = null;

      if (details.imdbId) {
        const tmdbMovie = await findByImdbId(details.imdbId);
        if (tmdbMovie) tmdbId = tmdbMovie.id;
      }

      if (!tmdbId) {
        const match = await findTmdbMatch(details.title || listingTitle);
        if (match.outcome === 'matched' && match.movie) {
          tmdbId = match.movie.id;
        }
      }

      if (!isDryRun()) {
        await supabase.from('egypt_releases').upsert(
          {
            elcinema_id: elcinemaId,
            imdb_id: details.imdbId,
            tmdb_id: tmdbId,
            title: details.title || listingTitle,
            release_year: details.releaseYear,
            release_date: details.releaseDate,
            match_status: tmdbId ? 'matched' : 'unmatched',
          },
          { onConflict: 'elcinema_id' },
        );
      }

      if (tmdbId) {
        matched += 1;
      } else {
        unmatched += 1;
      }
    } catch (err) {
      console.warn(`  work ${elcinemaId} (${listingTitle}): failed (${(err as Error).message})`);
      unmatched += 1;
    }

    if (processed % 25 === 0) {
      console.log(`  processed ${processed}/${uniqueMovies.size} (matched: ${matched}, unmatched: ${unmatched})`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\nMatching done: ${matched} matched, ${unmatched} unmatched.`);
  if (isDryRun()) {
    console.log(
      '[dry run] Skipping distributor table build -- it reads egypt_releases rows this run would have just written.',
    );
    console.log('\nDone (dry run).');
    return;
  }
  console.log('Building distributor table from production companies...');

  const { data: matchedReleases } = await supabase
    .from('egypt_releases')
    .select('tmdb_id, release_year')
    .eq('match_status', 'matched')
    .not('tmdb_id', 'is', null);

  const distributors = new Map<
    number,
    { name: string; count: number; firstYear: number | null; lastYear: number | null }
  >();

  let companiesProcessed = 0;
  for (const release of matchedReleases ?? []) {
    companiesProcessed += 1;
    try {
      const movieDetails = await fetchMovieDetails(release.tmdb_id!);
      for (const company of movieDetails.production_companies ?? []) {
        const existing = distributors.get(company.id);
        const year = release.release_year;
        if (existing) {
          existing.count += 1;
          if (year) {
            existing.firstYear = existing.firstYear ? Math.min(existing.firstYear, year) : year;
            existing.lastYear = existing.lastYear ? Math.max(existing.lastYear, year) : year;
          }
        } else {
          distributors.set(company.id, {
            name: company.name,
            count: 1,
            firstYear: year,
            lastYear: year,
          });
        }
      }
    } catch (err) {
      console.warn(`  tmdb ${release.tmdb_id}: failed to fetch production companies (${(err as Error).message})`);
    }

    if (companiesProcessed % 25 === 0) {
      console.log(`  companies: processed ${companiesProcessed}/${matchedReleases?.length ?? 0}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\nUpserting ${distributors.size} distributors...`);
  for (const [tmdbCompanyId, info] of distributors) {
    await supabase.from('egypt_distributors').upsert(
      {
        tmdb_company_id: tmdbCompanyId,
        name: info.name,
        release_count: info.count,
        first_seen_year: info.firstYear,
        last_seen_year: info.lastYear,
      },
      { onConflict: 'tmdb_company_id' },
    );
  }

  console.log('\nDone.');
  console.log(`Total unique movies scraped: ${uniqueMovies.size}`);
  console.log(`Matched to TMDB: ${matched}`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Distinct distributors: ${distributors.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
