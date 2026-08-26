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
