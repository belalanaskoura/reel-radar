-- Idempotent: this column already existed live before the schema-sync
-- pipeline's tracked migration history caught up to it (predates the
-- pipeline itself, see CLAUDE.md's Phase 8 notes) -- 20260909173536's
-- own copy of this same statement had to be removed after it aborted
-- that migration's whole transaction with a duplicate_column error on
-- first real apply. `if not exists` makes this migration a safe no-op
-- everywhere it's applied, including a fresh database that never had
-- the column at all.
alter table "public"."movies" add column if not exists "release_date_confirmed_eg" boolean not null default false;


