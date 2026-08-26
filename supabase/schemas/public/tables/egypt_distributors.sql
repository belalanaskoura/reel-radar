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
