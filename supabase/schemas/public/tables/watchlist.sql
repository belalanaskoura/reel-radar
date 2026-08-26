create table "public"."watchlist" (
  "user_id"    uuid                     not null,
  "movie_id"   uuid                     not null,
  "created_at" timestamp with time zone not null default now(),
  constraint "watchlist_movie_id_fkey" foreign key (movie_id) references public.movies(id) on delete cascade,
  constraint "watchlist_pkey" primary key (user_id, movie_id),
  constraint "watchlist_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."watchlist"
  enable row level security;

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
