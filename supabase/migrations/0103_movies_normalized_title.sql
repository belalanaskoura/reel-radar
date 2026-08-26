-- Closes the title-race duplicate-movie bug: scrape-scene and scrape-vox
-- each check "does a movie with this title already exist" (via a plain
-- SELECT, findExistingMovieByTitle) before inserting a new placeholder --
-- but movies.title has no unique constraint, so two overlapping scrape
-- runs discovering the same brand-new title at once (e.g. scrape-scene's
-- staggered offset jobs, or scrape-scene and scrape-vox both picking up a
-- movie that just debuted on both chains) can both miss the check and
-- both insert. Same duplicate-row failure mode already fixed for slugs
-- (movie_branch_slugs' unique (branch_id, slug) constraint) -- unlike
-- slugs, exact-title collision had no constraint to catch the loser.
--
-- normalized_title is nullable and only ever written by the two scraper
-- routes on placeholder insert (sync-movies' TMDB-sourced rows are keyed
-- by the real tmdb_id unique constraint instead, and aren't part of this
-- race). NULL is excluded from a unique index's uniqueness check in
-- Postgres, so existing rows and any future insert that doesn't set this
-- column are unaffected.
alter table "public"."movies"
  add column "normalized_title" text;

create unique index "movies_normalized_title_key"
  on "public"."movies" ("normalized_title");
