-- Two indexes for query shapes that filter on the non-leading column of
-- an existing composite primary key. Both are fine today at this app's
-- current row counts (a full scan of a few thousand rows is trivial) but
-- were flagged during a scalability audit as worth adding ahead of real
-- growth, since both back queries that run on every scheduled job
-- invocation regardless of load, not just on-demand user requests.
--
-- watchlist has PK (user_id, movie_id), but /api/poll's notifyWatchers
-- filters by movie_id alone (one poll cycle, once per bookable movie) --
-- the non-leading column, so the PK's btree doesn't serve this lookup
-- efficiently on its own.
create index if not exists watchlist_movie_id_idx
  on public.watchlist (movie_id);

-- showtimes_cache has PK (movie_id, branch_id), but the delisting sweep
-- in both scrape-scene-delist and scrape-vox filters by branch_id first
-- (.eq('branch_id', ...).eq('bookable', true)) -- also the non-leading
-- column, and this one runs on every scheduled scrape/delist cycle.
create index if not exists showtimes_cache_branch_id_idx
  on public.showtimes_cache (branch_id, bookable);
