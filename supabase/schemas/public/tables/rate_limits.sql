create table "public"."rate_limits" (
  "key"          text                     not null,
  "count"        integer                  not null default 0,
  "window_start" timestamp with time zone not null default now(),
  constraint "rate_limits_pkey" primary key (key)
);

alter table "public"."rate_limits"
  enable row level security;

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."rate_limits" to "anon", "authenticated", "postgres", "service_role";
