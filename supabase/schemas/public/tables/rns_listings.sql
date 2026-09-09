create table "public"."rns_listings" (
  "movie_id" uuid not null,
  "slug"     text not null,
  constraint "rns_listings_pkey" primary key (movie_id),
  constraint "rns_listings_slug_key" unique (slug),
  constraint "rns_listings_movie_id_fkey" foreign key (movie_id) references public.movies(id) on delete cascade
);

alter table "public"."rns_listings"
  enable row level security;

-- Tracks which `movies` row each RNS (rnscinemas.com) coming-soon slug is
-- linked to, same idempotency purpose as movie_branch_slugs -- but RNS is
-- a catalog-discovery source, not a branch/chain this app tracks
-- bookability for (no booking flow, no showtimes_cache rows), so this is
-- a standalone table instead of another movie_branch_slugs row tied to a
-- `branches` foreign key.
create policy "rns_listings are publicly readable" on "public"."rns_listings"
  for select
  to PUBLIC
  using (true);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."rns_listings" to "anon", "authenticated", "postgres", "service_role";
