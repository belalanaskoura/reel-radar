# Database schema and migrations

Schema and row-level-security policies live here, in version control,
not only in the Supabase SQL Editor.

RLS *is* this app's authorization model — several writes go straight from
the browser to PostgREST and are safe only because a policy says so. A
policy that exists only in a web UI can't be reviewed in a pull request,
diffed against what shipped, or rebuilt if the project is lost.

## How a schema change actually happens

`supabase/schemas/` is the source of truth — one file per table/function,
declarative (this is what you edit, not `migrations/`). `config.toml`'s
`schema_paths` lists them in an explicit, hand-ordered array: the CLI's
glob has no `**` support and resolves files within one glob in
lexicographic filename order, not dependency order, so tables/functions
with real cross-references (a trigger's function must exist before the
table that references it; `movies` before `movie_branch_slugs`) have to
be ordered by hand.

`.github/workflows/supabase-schema.yml` does the rest:

- **On a PR** touching `supabase/schemas/**`, `config.toml`, or
  `migrations/**`: a `plan` job diffs your schema changes against the
  real linked project and posts the pending SQL as a read-only preview in
  the PR's job summary. Nothing is written.
- **On push to `main`**: an `apply` job diffs `schemas/` against a local
  shadow DB (built by replaying every file in `migrations/`). If that
  produces a new migration, it's committed to a `schema-sync/<name>`
  branch and opened as a PR — the workflow deliberately never pushes
  straight to `main`, since branch protection rejects a same-run bot
  push. If nothing new was generated (the migration's already merged),
  it runs `supabase db push --linked`, applying already-reviewed SQL for
  real against production.

**There is no fully-automatic, unreviewed path to production.** Every
real schema change lands as a PR a human merges; only the run triggered
by that merge actually touches the live database. Required repo secrets
for this workflow (separate from the app's own Supabase keys used by
`ci.yml`): `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`,
`SUPABASE_DB_PASSWORD`.

`migrations/0099_baseline.sql` is a hand-written baseline covering every
table that predates migration tracking. Migrations `0001`–`0003` were
applied by hand, long before this, and were never captured as files at
all — recovering the schema at that point in time would need
`supabase link --project-ref <ref>` + `supabase db pull` against a
project old enough to still have it, which is no longer possible now
that the live project has moved past that state.
