
  create table "public"."scrape_cursors" (
    "key" text not null,
    "next_offset" integer not null default 0,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."scrape_cursors" enable row level security;

alter table "public"."movies" add column "release_date_confirmed_eg" boolean not null default false;

CREATE UNIQUE INDEX scrape_cursors_pkey ON public.scrape_cursors USING btree (key);

alter table "public"."scrape_cursors" add constraint "scrape_cursors_pkey" PRIMARY KEY using index "scrape_cursors_pkey";

grant delete on table "public"."scrape_cursors" to "anon";

grant insert on table "public"."scrape_cursors" to "anon";

grant references on table "public"."scrape_cursors" to "anon";

grant select on table "public"."scrape_cursors" to "anon";

grant trigger on table "public"."scrape_cursors" to "anon";

grant truncate on table "public"."scrape_cursors" to "anon";

grant update on table "public"."scrape_cursors" to "anon";

grant delete on table "public"."scrape_cursors" to "authenticated";

grant insert on table "public"."scrape_cursors" to "authenticated";

grant references on table "public"."scrape_cursors" to "authenticated";

grant select on table "public"."scrape_cursors" to "authenticated";

grant trigger on table "public"."scrape_cursors" to "authenticated";

grant truncate on table "public"."scrape_cursors" to "authenticated";

grant update on table "public"."scrape_cursors" to "authenticated";

grant delete on table "public"."scrape_cursors" to "service_role";

grant insert on table "public"."scrape_cursors" to "service_role";

grant references on table "public"."scrape_cursors" to "service_role";

grant select on table "public"."scrape_cursors" to "service_role";

grant trigger on table "public"."scrape_cursors" to "service_role";

grant truncate on table "public"."scrape_cursors" to "service_role";

grant update on table "public"."scrape_cursors" to "service_role";


