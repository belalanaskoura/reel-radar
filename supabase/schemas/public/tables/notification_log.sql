create table "public"."notification_log" (
  "user_id"     uuid                     not null,
  "movie_id"    uuid                     not null,
  "branch_id"   text,
  "notified_at" timestamp with time zone not null default now(),
  "id"          uuid                     not null default gen_random_uuid(),
  "kind"        text                     not null default 'showtime'::text,
  "title"       text,
  "message"     text,
  "url"         text,
  "sent_at"     timestamp with time zone not null default now(),
  "read_at"     timestamp with time zone,
  constraint "notification_log_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade,
  constraint "notification_log_kind_check" check ((kind = ANY (ARRAY['showtime'::text, 'new_release'::text, 'lineup_added'::text, 'lineup_removed'::text]))),
  constraint "notification_log_movie_id_fkey" foreign key (movie_id) references public.movies(id) on delete cascade,
  constraint "notification_log_pkey" primary key (id),
  constraint "notification_log_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."notification_log"
  enable row level security;

create unique index notification_log_new_release_unique on public.notification_log using btree (user_id, movie_id)
  where (kind = 'new_release'::text);

create unique index notification_log_showtime_unique on public.notification_log using btree (user_id, movie_id, branch_id)
  where (kind = 'showtime'::text);

create policy "Users can mark own notifications read" on "public"."notification_log"
  for update
  to PUBLIC
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy "select own notification log" on "public"."notification_log"
  for select
  to PUBLIC
  using ((auth.uid() = user_id));

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."notification_log" to "anon", "authenticated", "postgres", "service_role";
