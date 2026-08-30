create table "public"."movies" (
  "id"             uuid                     not null default gen_random_uuid(),
  "tmdb_id"        integer,
  "title"          text                     not null,
  "original_title" text,
  "poster_path"    text,
  "release_date"   date,
  "release_date_confirmed_eg" boolean       not null default false,
  "match_status"   text                     not null default 'unmatched'::text,
  "created_at"     timestamp with time zone not null default now(),
  "popularity"     numeric,
  "matched_at"     timestamp with time zone,
  "normalized_title" text,
  constraint "movies_match_status_check" check ((match_status = ANY (ARRAY['matched'::text, 'ambiguous'::text, 'unmatched'::text]))),
  constraint "movies_pkey" primary key (id),
  constraint "movies_tmdb_id_key" unique (tmdb_id)
);

alter table "public"."movies"
  enable row level security;

create index movies_release_date_idx on public.movies using btree (release_date);

-- release_date_confirmed_eg is false whenever release_date is a fallback
-- (TMDB's US theatrical date, or its ambiguous top-level release_date as a
-- last resort) rather than a real elCinema/EG-confirmed date -- see
-- resolveDisplayReleaseDate() in src/lib/matching/egypt-release-date.ts.
-- The UI labels an unconfirmed date instead of presenting a guess as fact.

-- Written only by scrape-scene/scrape-vox on placeholder insert, to close
-- a duplicate-movie race -- see migration 0103's comment for the full
-- reasoning. NULL (every row from before this column existed, and any
-- row inserted by a path that doesn't set it) is excluded from a unique
-- index's uniqueness check in Postgres.
create unique index movies_normalized_title_key on public.movies using btree (normalized_title);

create policy "movies are publicly readable" on "public"."movies"
  for select
  to PUBLIC
  using (true);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."movies" to "anon", "authenticated", "postgres", "service_role";
