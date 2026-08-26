create table "public"."cinema_follows" (
  "user_id"    uuid                     not null,
  "branch_id"  text                     not null,
  "created_at" timestamp with time zone not null default now(),
  constraint "cinema_follows_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade,
  constraint "cinema_follows_pkey" primary key (user_id, branch_id),
  constraint "cinema_follows_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

alter table "public"."cinema_follows"
  enable row level security;

create policy "Users manage their own cinema follows" on "public"."cinema_follows"
  for all
  to PUBLIC
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."cinema_follows" to "anon", "authenticated", "postgres", "service_role";
