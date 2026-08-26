create table "public"."notification_deliveries" (
  "id"         bigint                   generated always as identity not null,
  "created_at" timestamp with time zone not null default now(),
  "user_id"    uuid                     not null,
  "movie_id"   uuid,
  "branch_id"  text,
  "channel"    text                     not null,
  "success"    boolean                  not null,
  "error"      text,
  constraint "notification_deliveries_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade,
  constraint "notification_deliveries_channel_check" check ((channel = ANY (ARRAY['email'::text, 'push'::text]))),
  constraint "notification_deliveries_movie_id_fkey" foreign key (movie_id) references public.movies(id) on delete cascade,
  constraint "notification_deliveries_pkey" primary key (id),
  constraint "notification_deliveries_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."notification_deliveries"
  enable row level security;

create index notification_deliveries_channel_idx on public.notification_deliveries using btree (channel, success);

create index notification_deliveries_time_idx on public.notification_deliveries using btree (created_at desc);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."notification_deliveries" to "anon", "authenticated", "postgres", "service_role";
