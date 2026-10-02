-- Idempotent: the original apply of this migration aborted partway
-- through (profiles.notify_showtime_reminders already existed live from
-- an earlier out-of-band apply), so every statement below is written to
-- be a safe no-op wherever it already landed, same pattern as
-- 20260909183117_schema_faa6424.sql.
alter table "public"."notification_log" drop constraint if exists "notification_log_kind_check";

alter table "public"."profiles" add column if not exists "notify_showtime_reminders" boolean not null default true;

alter table "public"."showtimes_cache" add column if not exists "formats" text[] not null default '{}'::text[];

alter table "public"."watchlist" add column if not exists "last_bookable_alert_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS watchlist_last_bookable_alert_at_idx ON public.watchlist USING btree (last_bookable_alert_at) WHERE (last_bookable_alert_at IS NOT NULL);

alter table "public"."notification_log" add constraint "notification_log_kind_check" CHECK ((kind = ANY (ARRAY['showtime'::text, 'new_release'::text, 'lineup_added'::text, 'lineup_removed'::text, 'showtime_reminder'::text]))) not valid;

alter table "public"."notification_log" validate constraint "notification_log_kind_check";


