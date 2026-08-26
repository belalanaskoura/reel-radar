create table "public"."welcome_email_log" (
  "user_id" uuid                     not null,
  "sent_at" timestamp with time zone not null default now(),
  constraint "welcome_email_log_pkey" primary key (user_id),
  constraint "welcome_email_log_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."welcome_email_log"
  enable row level security;

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."welcome_email_log" to "anon", "authenticated", "postgres", "service_role";
