create table "public"."scene_price_templates" (
  "id"          uuid                     not null default gen_random_uuid(),
  "branch_id"   text                     not null,
  "format"      text                     not null,
  "price_egp"   numeric                  not null,
  "verified_at" timestamp with time zone not null default now(),
  constraint "scene_price_templates_branch_id_fkey" foreign key (branch_id) references public.branches(id),
  constraint "scene_price_templates_branch_id_format_key" unique (branch_id, format),
  constraint "scene_price_templates_pkey" primary key (id)
);

alter table "public"."scene_price_templates"
  enable row level security;

create policy "scene_price_templates are publicly readable" on "public"."scene_price_templates"
  for select
  to PUBLIC
  using (true);

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."scene_price_templates" to "anon", "authenticated", "postgres", "service_role";
