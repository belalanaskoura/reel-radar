create table "public"."scrape_cursors" (
  "key"         text                     not null,
  "next_offset" integer                  not null default 0,
  "updated_at"  timestamp with time zone not null default now(),
  constraint "scrape_cursors_pkey" primary key (key)
);

alter table "public"."scrape_cursors"
  enable row level security;

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."scrape_cursors" to "anon", "authenticated", "postgres", "service_role";
