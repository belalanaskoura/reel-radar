create table "public"."error_log" (
  "id"          bigint                   generated always as identity not null,
  "source"      text                     not null,
  "message"     text                     not null,
  "stack"       text,
  "context"     jsonb,
  "occurred_at" timestamp with time zone not null default now(),
  constraint "error_log_pkey" primary key (id)
);

alter table "public"."error_log"
  enable row level security;

create index error_log_occurred_at_idx on public.error_log using btree (occurred_at desc);

create index error_log_source_occurred_at_idx on public.error_log using btree (source, occurred_at desc);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."error_log" to "anon", "authenticated", "postgres", "service_role";
