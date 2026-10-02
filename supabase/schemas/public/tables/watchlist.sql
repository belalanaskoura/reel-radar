create table "public"."watchlist" (
  "user_id"    uuid                     not null,
  "movie_id"   uuid                     not null,
  "created_at" timestamp with time zone not null default now(),
  /* When this user was last told this movie is bookable, either by
     /api/poll's first alert or by /api/send-reminders. Null until the
     first alert. The reminder job claims a send with a conditional
     update on this column, so two overlapping runs can't both send. */
  "last_bookable_alert_at" timestamp with time zone,
  constraint "watchlist_movie_id_fkey" foreign key (movie_id) references public.movies(id) on delete cascade,
  constraint "watchlist_pkey" primary key (user_id, movie_id),
  constraint "watchlist_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."watchlist"
  enable row level security;

-- /api/poll's notifyWatchers filters by movie_id alone (the PK's
-- non-leading column), on every scheduled poll run.
create index if not exists watchlist_movie_id_idx
  on public.watchlist (movie_id);

/* /api/send-reminders scans for rows whose last alert is over 24h old. */
create index if not exists watchlist_last_bookable_alert_at_idx
  on public.watchlist (last_bookable_alert_at)
  where (last_bookable_alert_at is not null);

create policy "delete own watchlist" on "public"."watchlist"
  for delete
  to PUBLIC
  using ((auth.uid() = user_id));

create policy "insert own watchlist" on "public"."watchlist"
  for insert
  to PUBLIC
  with check ((auth.uid() = user_id));

create policy "select own watchlist" on "public"."watchlist"
  for select
  to PUBLIC
  using ((auth.uid() = user_id));

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."watchlist" to "anon", "authenticated", "postgres", "service_role";
