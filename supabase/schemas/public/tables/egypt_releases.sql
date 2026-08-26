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
