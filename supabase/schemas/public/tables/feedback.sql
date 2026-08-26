create table "public"."feedback" (
  "id"         uuid                     not null default gen_random_uuid(),
  "user_id"    uuid                     not null,
  "email"      text                     not null,
  "message"    text                     not null,
  "created_at" timestamp with time zone not null default now(),
  constraint "feedback_pkey" primary key (id),
  constraint "feedback_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."feedback"
  enable row level security;

create policy "Users can insert their own feedback" on "public"."feedback"
  for insert
  to "authenticated"
  with check ((auth.uid() = user_id));

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."feedback" to "anon", "authenticated", "postgres", "service_role";
