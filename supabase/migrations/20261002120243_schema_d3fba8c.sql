alter table "public"."notification_log" drop constraint "notification_log_kind_check";

alter table "public"."profiles" add column "notify_showtime_reminders" boolean not null default true;

alter table "public"."showtimes_cache" add column "formats" text[] not null default '{}'::text[];

alter table "public"."watchlist" add column "last_bookable_alert_at" timestamp with time zone;

CREATE INDEX watchlist_last_bookable_alert_at_idx ON public.watchlist USING btree (last_bookable_alert_at) WHERE (last_bookable_alert_at IS NOT NULL);

alter table "public"."notification_log" add constraint "notification_log_kind_check" CHECK ((kind = ANY (ARRAY['showtime'::text, 'new_release'::text, 'lineup_added'::text, 'lineup_removed'::text, 'showtime_reminder'::text]))) not valid;

alter table "public"."notification_log" validate constraint "notification_log_kind_check";


