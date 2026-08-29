-- Closes a false-positive "lineup removed" bug: scrape-scene-delist and
-- scrape-vox's inline delist step both treated a single scrape's absence
-- as proof a movie was pulled from a branch's lineup, with no way to tell
-- a real delisting apart from a transient miss (a slow render, a momentary
-- empty listing section, a one-off network hiccup on Scene's/elCinema's
-- side) -- confirmed for real: users were notified a movie left a cinema
-- it never actually left, sometimes followed by a same-movie "added"
-- notification once the very next scrape saw it again.
--
-- pending_removal_since turns delisting into a two-strikes check: the
-- first run that doesn't see a previously-linked movie only marks it
-- pending (no notification, bookable left untouched); a second
-- consecutive miss confirms the removal and fires the notification; a
-- movie that reappears while pending has the flag cleared with nothing
-- ever sent. Nullable and only ever written by the two delist code paths.
alter table "public"."showtimes_cache"
  add column "pending_removal_since" timestamp with time zone;
