create table "public"."push_subscriptions" (
  "id"         uuid                     not null default gen_random_uuid(),
  "user_id"    uuid                     not null,
  "endpoint"   text                     not null,
  "p256dh"     text                     not null,
  "auth"       text                     not null,
  "created_at" timestamp with time zone not null default now(),
  constraint "push_subscriptions_pkey" primary key (id),
  constraint "push_subscriptions_user_id_endpoint_key" unique (user_id, endpoint),
  constraint "push_subscriptions_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."push_subscriptions"
  enable row level security;

create policy "Users manage own push subscriptions" on "public"."push_subscriptions"
  for all
  to PUBLIC
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."push_subscriptions" to "anon", "authenticated", "postgres", "service_role";
