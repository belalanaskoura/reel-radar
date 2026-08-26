create table "public"."analytics_events" (
  "id"          bigint                   generated always as identity not null,
  "event_type"  text                     not null,
  "occurred_at" timestamp with time zone not null default now(),
  "payload"     jsonb                    not null default '{}'::jsonb,
  constraint "analytics_events_pkey" primary key (id)
);

alter table "public"."analytics_events"
  enable row level security;

create index analytics_events_type_occurred_at_idx on public.analytics_events using btree (event_type, occurred_at desc);

create index analytics_events_type_time_idx on public.analytics_events using btree (event_type, occurred_at desc);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."analytics_events" to "anon", "authenticated", "postgres", "service_role";
