# Database migrations

Schema and row-level-security policies belong here, in version control,
not only in the Supabase SQL Editor.

RLS *is* this app's authorization model — several writes go straight from
the browser to PostgREST and are safe only because a policy says so. A
policy that exists only in a web UI can't be reviewed in a pull request,
diffed against what shipped, or rebuilt if the project is lost.

## Applying a migration

These are written to be pasted into the Supabase SQL Editor, since this
project has no migration tooling wired up. Run them in filename order.
Each is safe to re-run (`if not exists` / `create or replace` throughout).

## Recovering the existing schema

Migrations `0001`–`0003` were applied by hand and are not in this
directory; everything the live database has beyond `0100`/`0101` exists
only in the Supabase project. To bring it back under version control:

    supabase link --project-ref <ref>
    supabase db pull

That writes the current live schema — tables, policies, triggers,
functions — as a migration file. Commit it. Until that happens, the
policies protecting `profiles`, `watchlist`, `cinema_follows`,
`push_subscriptions`, `notification_log` and the `avatars` storage bucket
are unreviewable from this repository.
