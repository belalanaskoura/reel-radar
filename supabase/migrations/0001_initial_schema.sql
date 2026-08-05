-- Branches: the two Scene Cinemas locations we scrape.
create table branches (
  id text primary key, -- 'cfc' | 'district5'
  name text not null,
  base_url text not null
);

insert into branches (id, name, base_url) values
  ('cfc', 'Cairo Festival City', 'https://cfc.scenecinemas.com'),
  ('district5', 'District 5', 'https://district5.scenecinemas.com');

-- Movies: TMDB-sourced upcoming releases. A movie can exist here before
-- it's matched to any Scene branch, or before it's even listed on Scene.
create table movies (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer unique,
  title text not null,
  original_title text,
  poster_path text,
  release_date date,
  popularity numeric,
  match_status text not null default 'unmatched'
    check (match_status in ('matched', 'ambiguous', 'unmatched')),
  created_at timestamptz not null default now()
);

create index movies_release_date_idx on movies (release_date);

-- Per-branch Scene slug for a movie. Kept separate from `movies` because
-- Phase 0 found slugs are not always shared across branches for the same
-- title (format-variant suffixes differ, e.g. toy-story-5 vs toy-story-5-2d).
create table movie_branch_slugs (
  movie_id uuid not null references movies (id) on delete cascade,
  branch_id text not null references branches (id) on delete cascade,
  slug text not null,
  primary key (movie_id, branch_id)
);

-- One row per (movie, branch), shared across all users. This is what makes
-- polling once per (movie, branch) --- not once per user --- possible.
create table showtimes_cache (
  movie_id uuid not null references movies (id) on delete cascade,
  branch_id text not null references branches (id) on delete cascade,
  bookable boolean not null default false,
  last_checked_at timestamptz,
  raw_showtimes jsonb,
  primary key (movie_id, branch_id)
);

-- A user's watchlist. Scoped to auth.users via RLS (added in Phase 3).
create table watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id uuid not null references movies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

-- Tracks which (user, movie, branch) combos have already been notified,
-- so a bookable movie triggers exactly one push per user, not one per poll.
create table notification_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id uuid not null references movies (id) on delete cascade,
  branch_id text not null references branches (id) on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (user_id, movie_id, branch_id)
);
