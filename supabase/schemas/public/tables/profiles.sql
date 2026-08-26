create table "public"."profiles" (
  "id"                             uuid                     not null,
  "created_at"                     timestamp with time zone not null default now(),
  "email"                          text,
  "avatar_url"                     text,
  "display_name"                   text,
  "notify_new_releases"            boolean                  not null default true,
  "notify_cinema_showtimes"        boolean                  not null default true,
  "subscribed_branch_ids"          text[],
  "notify_cinema_lineup"           boolean                  not null default true,
  "watchlist_booking_click_action" text                     not null default 'ask'::text,
  constraint "profiles_id_fkey" foreign key (id) references auth.users(id) on delete cascade,
  constraint "profiles_pkey" primary key (id),
  constraint "profiles_watchlist_booking_click_action_check" check ((watchlist_booking_click_action = ANY (ARRAY['ask'::text, 'always_remove'::text, 'always_keep'::text])))
);

alter table "public"."profiles"
  enable row level security;

create policy "select own profile" on "public"."profiles"
  for select
  to PUBLIC
  using ((auth.uid() = id));

create policy "update own profile" on "public"."profiles"
  for update
  to PUBLIC
  using ((auth.uid() = id));

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."profiles" to "anon", "authenticated", "postgres", "service_role";
