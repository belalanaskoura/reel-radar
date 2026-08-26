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
