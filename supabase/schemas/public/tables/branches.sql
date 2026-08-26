create table "public"."branches" (
  "id"       text   not null,
  "name"     text   not null,
  "base_url" text   not null,
  "formats"  text[] not null default '{}'::text[],
  "address"  text,
  "chain"    text   not null default 'scene'::text,
  "logo_url" text,
  constraint "branches_chain_check" check ((chain = ANY (ARRAY['scene'::text, 'vox'::text]))),
  constraint "branches_pkey" primary key (id)
);

alter table "public"."branches"
  enable row level security;

create policy "branches are publicly readable" on "public"."branches"
  for select
  to PUBLIC
  using (true);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."branches" to "anon", "authenticated", "postgres", "service_role";
