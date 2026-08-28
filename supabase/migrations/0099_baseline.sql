-- Baseline: every table that existed before this repo started tracking
-- schema changes as migration files (0100 onward). These were created
-- directly in Supabase's SQL Editor across many earlier sessions, with
-- only supabase/schemas/ (the declarative mirror) ever kept in sync --
-- migrations/ had no record of them at all.
--
-- This came up as a real, live failure: supabase/schemas/*.sql (the
-- Supabase CLI's declarative diff source, `db diff --linked --use-migra`)
-- builds its comparison by replaying every file in migrations/, in order,
-- into a fresh shadow database. Migration 0101 indexes analytics_events,
-- but no earlier file ever created that table -- so the replay failed
-- outright with `relation "public.analytics_events" does not exist` the
-- first time this was actually exercised in CI, silently masked by that
-- job's `|| true` (the check still showed green). This file closes that
-- gap so the replay reaches a real, consistent state matching production.
--
-- Content is copied verbatim from supabase/schemas/public/tables/*.sql,
-- which was verified column-by-column against a live schema dump before
-- this was written -- with two deliberate exceptions, so this file
-- represents schema state as of just before 0100, not current state:
--   - movies: no normalized_title column/index (added by 0103)
--   - analytics_events: only its original index (added by 0101);
--     analytics_events_type_time_idx (a second, later, undocumented
--     index -- also missing its own migration) is added by 0100_baseline
--     -- no, by this file, since it's real live state with nothing in
--     migrations/ to add it afterward and no later file depends on its
--     absence.
-- rate_limits is deliberately NOT included -- 0100_rate_limits.sql
-- already creates it (with `if not exists`, but there's no reason to
-- rely on that guard when this file can just not duplicate it).
--
-- Ordered so every foreign key's target table exists first.

create table "public"."branches" (
  "id"       text   not null,
  "name"     text   not null,
  "base_url" text   not null,
  "formats"  text[] not null default '{}'::text[],
  "address"  text,
  "chain"    text   not null default 'scene'::text,
  "logo_url" text,
  constraint "branches_chain_check" check ((chain = ANY (ARRAY['scene'::text, 'vox'::text]))),
  constraint "branches_pkey" primary key (id)
);

alter table "public"."branches"
  enable row level security;

create policy "branches are publicly readable" on "public"."branches"
  for select
  to PUBLIC
  using (true);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."branches" to "anon", "authenticated", "postgres", "service_role";

create table "public"."movies" (
  "id"             uuid                     not null default gen_random_uuid(),
  "tmdb_id"        integer,
  "title"          text                     not null,
  "original_title" text,
  "poster_path"    text,
  "release_date"   date,
  "match_status"   text                     not null default 'unmatched'::text,
  "created_at"     timestamp with time zone not null default now(),
  "popularity"     numeric,
  "matched_at"     timestamp with time zone,
  constraint "movies_match_status_check" check ((match_status = ANY (ARRAY['matched'::text, 'ambiguous'::text, 'unmatched'::text]))),
  constraint "movies_pkey" primary key (id),
  constraint "movies_tmdb_id_key" unique (tmdb_id)
);

alter table "public"."movies"
  enable row level security;

create index movies_release_date_idx on public.movies using btree (release_date);

create policy "movies are publicly readable" on "public"."movies"
  for select
  to PUBLIC
  using (true);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."movies" to "anon", "authenticated", "postgres", "service_role";

create table "public"."movie_branch_slugs" (
  "movie_id"  uuid not null,
  "branch_id" text not null,
  "slug"      text not null,
  constraint "movie_branch_slugs_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade,
  constraint "movie_branch_slugs_branch_slug_key" unique (branch_id, slug),
  constraint "movie_branch_slugs_pkey" primary key (movie_id, branch_id),
  constraint "movie_branch_slugs_movie_id_fkey" foreign key (movie_id) references public.movies(id) on delete cascade
);

alter table "public"."movie_branch_slugs"
  enable row level security;

create policy "movie_branch_slugs are publicly readable" on "public"."movie_branch_slugs"
  for select
  to PUBLIC
  using (true);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."movie_branch_slugs" to "anon", "authenticated", "postgres", "service_role";

create or replace function public.set_was_ever_bookable()
  returns trigger
  language plpgsql
  AS $function$
begin
  if new.bookable = true then
    new.was_ever_bookable := true;
  end if;
  return new;
end;
$function$;

grant execute on function "public"."set_was_ever_bookable"() to public, "anon", "authenticated", "postgres", "service_role";

create table "public"."showtimes_cache" (
  "movie_id"          uuid                     not null,
  "branch_id"         text                     not null,
  "bookable"          boolean                  not null default false,
  "last_checked_at"   timestamp with time zone,
  "raw_showtimes"     jsonb,
  "was_ever_bookable" boolean                  not null default false,
  constraint "showtimes_cache_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade,
  constraint "showtimes_cache_movie_id_fkey" foreign key (movie_id) references public.movies(id) on delete cascade,
  constraint "showtimes_cache_pkey" primary key (movie_id, branch_id)
);

alter table "public"."showtimes_cache"
  enable row level security;

create trigger showtimes_cache_was_ever_bookable
  before insert or update on public.showtimes_cache
  for each row
  execute function public.set_was_ever_bookable();

create policy "showtimes_cache is publicly readable" on "public"."showtimes_cache"
  for select
  to PUBLIC
  using (true);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."showtimes_cache" to "anon", "authenticated", "postgres", "service_role";

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

create table "public"."notification_log" (
  "user_id"     uuid                     not null,
  "movie_id"    uuid                     not null,
  "branch_id"   text,
  "notified_at" timestamp with time zone not null default now(),
  "id"          uuid                     not null default gen_random_uuid(),
  "kind"        text                     not null default 'showtime'::text,
  "title"       text,
  "message"     text,
  "url"         text,
  "sent_at"     timestamp with time zone not null default now(),
  "read_at"     timestamp with time zone,
  constraint "notification_log_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade,
  constraint "notification_log_kind_check" check ((kind = ANY (ARRAY['showtime'::text, 'new_release'::text, 'lineup_added'::text, 'lineup_removed'::text]))),
  constraint "notification_log_movie_id_fkey" foreign key (movie_id) references public.movies(id) on delete cascade,
  constraint "notification_log_pkey" primary key (id),
  constraint "notification_log_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."notification_log"
  enable row level security;

create unique index notification_log_new_release_unique on public.notification_log using btree (user_id, movie_id)
  where (kind = 'new_release'::text);

create unique index notification_log_showtime_unique on public.notification_log using btree (user_id, movie_id, branch_id)
  where (kind = 'showtime'::text);

create policy "Users can mark own notifications read" on "public"."notification_log"
  for update
  to PUBLIC
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy "select own notification log" on "public"."notification_log"
  for select
  to PUBLIC
  using ((auth.uid() = user_id));

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."notification_log" to "anon", "authenticated", "postgres", "service_role";

create table "public"."notification_deliveries" (
  "id"         bigint                   generated always as identity not null,
  "created_at" timestamp with time zone not null default now(),
  "user_id"    uuid                     not null,
  "movie_id"   uuid,
  "branch_id"  text,
  "channel"    text                     not null,
  "success"    boolean                  not null,
  "error"      text,
  constraint "notification_deliveries_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade,
  constraint "notification_deliveries_channel_check" check ((channel = ANY (ARRAY['email'::text, 'push'::text]))),
  constraint "notification_deliveries_movie_id_fkey" foreign key (movie_id) references public.movies(id) on delete cascade,
  constraint "notification_deliveries_pkey" primary key (id),
  constraint "notification_deliveries_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."notification_deliveries"
  enable row level security;

create index notification_deliveries_channel_idx on public.notification_deliveries using btree (channel, success);

create index notification_deliveries_time_idx on public.notification_deliveries using btree (created_at desc);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."notification_deliveries" to "anon", "authenticated", "postgres", "service_role";

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$function$;

grant execute on function "public"."handle_new_user"() to public, "anon", "authenticated", "postgres", "service_role";

create or replace function public.sync_profile_email()
  returns trigger
  language plpgsql
  security definer
  AS $function$
BEGIN
  UPDATE profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$function$;

grant execute on function "public"."sync_profile_email"() to public, "anon", "authenticated", "postgres", "service_role";

create table "public"."profiles" (
  "id"                             uuid                     not null,
  "created_at"                     timestamp with time zone not null default now(),
  "email"                          text,
  "avatar_url"                     text,
  "display_name"                   text,
  "notify_new_releases"            boolean                  not null default true,
  "notify_cinema_showtimes"        boolean                  not null default true,
  "subscribed_branch_ids"          text[],
  "notify_cinema_lineup"           boolean                  not null default true,
  "watchlist_booking_click_action" text                     not null default 'ask'::text,
  constraint "profiles_id_fkey" foreign key (id) references auth.users(id) on delete cascade,
  constraint "profiles_pkey" primary key (id),
  constraint "profiles_watchlist_booking_click_action_check" check ((watchlist_booking_click_action = ANY (ARRAY['ask'::text, 'always_remove'::text, 'always_keep'::text])))
);

alter table "public"."profiles"
  enable row level security;

create policy "select own profile" on "public"."profiles"
  for select
  to PUBLIC
  using ((auth.uid() = id));

create policy "update own profile" on "public"."profiles"
  for update
  to PUBLIC
  using ((auth.uid() = id));

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."profiles" to "anon", "authenticated", "postgres", "service_role";

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (((old.email)::text IS DISTINCT FROM (new.email)::text))
  execute function public.sync_profile_email();

create table "public"."push_subscriptions" (
  "id"         uuid                     not null default gen_random_uuid(),
  "user_id"    uuid                     not null,
  "endpoint"   text                     not null,
  "p256dh"     text                     not null,
  "auth"       text                     not null,
  "created_at" timestamp with time zone not null default now(),
  constraint "push_subscriptions_pkey" primary key (id),
  constraint "push_subscriptions_user_id_endpoint_key" unique (user_id, endpoint),
  constraint "push_subscriptions_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."push_subscriptions"
  enable row level security;

create policy "Users manage own push subscriptions" on "public"."push_subscriptions"
  for all
  to PUBLIC
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."push_subscriptions" to "anon", "authenticated", "postgres", "service_role";

create table "public"."feedback" (
  "id"         uuid                     not null default gen_random_uuid(),
  "user_id"    uuid                     not null,
  "email"      text                     not null,
  "message"    text                     not null,
  "created_at" timestamp with time zone not null default now(),
  constraint "feedback_pkey" primary key (id),
  constraint "feedback_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."feedback"
  enable row level security;

create policy "Users can insert their own feedback" on "public"."feedback"
  for insert
  to "authenticated"
  with check ((auth.uid() = user_id));

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."feedback" to "anon", "authenticated", "postgres", "service_role";

create table "public"."cinema_follows" (
  "user_id"    uuid                     not null,
  "branch_id"  text                     not null,
  "created_at" timestamp with time zone not null default now(),
  constraint "cinema_follows_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade,
  constraint "cinema_follows_pkey" primary key (user_id, branch_id),
  constraint "cinema_follows_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."cinema_follows"
  enable row level security;

create policy "Users manage their own cinema follows" on "public"."cinema_follows"
  for all
  to PUBLIC
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."cinema_follows" to "anon", "authenticated", "postgres", "service_role";

create table "public"."scene_price_templates" (
  "id"          uuid                     not null default gen_random_uuid(),
  "branch_id"   text                     not null,
  "format"      text                     not null,
  "price_egp"   numeric                  not null,
  "verified_at" timestamp with time zone not null default now(),
  constraint "scene_price_templates_branch_id_fkey" foreign key (branch_id) references public.branches(id),
  constraint "scene_price_templates_branch_id_format_key" unique (branch_id, format),
  constraint "scene_price_templates_pkey" primary key (id)
);

alter table "public"."scene_price_templates"
  enable row level security;

create policy "scene_price_templates are publicly readable" on "public"."scene_price_templates"
  for select
  to PUBLIC
  using (true);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."scene_price_templates" to "anon", "authenticated", "postgres", "service_role";

create table "public"."egypt_releases" (
  "id"           uuid                     not null default gen_random_uuid(),
  "elcinema_id"  integer                  not null,
  "imdb_id"      text,
  "tmdb_id"      integer,
  "title"        text                     not null,
  "release_year" integer,
  "match_status" text                     not null default 'unmatched'::text,
  "created_at"   timestamp with time zone not null default now(),
  "release_date" date,
  "poster_url"   text,
  constraint "egypt_releases_elcinema_id_key" unique (elcinema_id),
  constraint "egypt_releases_match_status_check" check ((match_status = ANY (ARRAY['matched'::text, 'unmatched'::text]))),
  constraint "egypt_releases_pkey" primary key (id)
);

alter table "public"."egypt_releases"
  enable row level security;

create index egypt_releases_tmdb_id_idx on public.egypt_releases using btree (tmdb_id);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."egypt_releases" to "anon", "authenticated", "postgres", "service_role";

create table "public"."egypt_distributors" (
  "tmdb_company_id" integer not null,
  "name"            text    not null,
  "release_count"   integer not null default 1,
  "first_seen_year" integer,
  "last_seen_year"  integer,
  constraint "egypt_distributors_pkey" primary key (tmdb_company_id)
);

alter table "public"."egypt_distributors"
  enable row level security;

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."egypt_distributors" to "anon", "authenticated", "postgres", "service_role";

create table "public"."analytics_events" (
  "id"          bigint                   generated always as identity not null,
  "event_type"  text                     not null,
  "occurred_at" timestamp with time zone not null default now(),
  "payload"     jsonb                    not null default '{}'::jsonb,
  constraint "analytics_events_pkey" primary key (id)
);

alter table "public"."analytics_events"
  enable row level security;

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."analytics_events" to "anon", "authenticated", "postgres", "service_role";

create table "public"."welcome_email_log" (
  "user_id"       uuid                     not null,
  "sent_at"       timestamp with time zone not null default now(),
  "invocation_id" uuid,
  constraint "welcome_email_log_pkey" primary key (user_id),
  constraint "welcome_email_log_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."welcome_email_log"
  enable row level security;

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."welcome_email_log" to "anon", "authenticated", "postgres", "service_role";
