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
