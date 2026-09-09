revoke delete on table "public"."egypt_distributors" from "anon";

revoke insert on table "public"."egypt_distributors" from "anon";

revoke references on table "public"."egypt_distributors" from "anon";

revoke select on table "public"."egypt_distributors" from "anon";

revoke trigger on table "public"."egypt_distributors" from "anon";

revoke truncate on table "public"."egypt_distributors" from "anon";

revoke update on table "public"."egypt_distributors" from "anon";

revoke delete on table "public"."egypt_distributors" from "authenticated";

revoke insert on table "public"."egypt_distributors" from "authenticated";

revoke references on table "public"."egypt_distributors" from "authenticated";

revoke select on table "public"."egypt_distributors" from "authenticated";

revoke trigger on table "public"."egypt_distributors" from "authenticated";

revoke truncate on table "public"."egypt_distributors" from "authenticated";

revoke update on table "public"."egypt_distributors" from "authenticated";

revoke delete on table "public"."egypt_distributors" from "service_role";

revoke insert on table "public"."egypt_distributors" from "service_role";

revoke references on table "public"."egypt_distributors" from "service_role";

revoke select on table "public"."egypt_distributors" from "service_role";

revoke trigger on table "public"."egypt_distributors" from "service_role";

revoke truncate on table "public"."egypt_distributors" from "service_role";

revoke update on table "public"."egypt_distributors" from "service_role";

alter table "public"."egypt_distributors" drop constraint "egypt_distributors_pkey";

drop index if exists "public"."egypt_distributors_pkey";

drop table "public"."egypt_distributors";


  create table "public"."rns_listings" (
    "movie_id" uuid not null,
    "slug" text not null
      );


alter table "public"."rns_listings" enable row level security;


  create table "public"."scrape_cursors" (
    "key" text not null,
    "next_offset" integer not null default 0,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."scrape_cursors" enable row level security;

alter table "public"."movies" add column "release_date_confirmed_eg" boolean not null default false;

CREATE UNIQUE INDEX rns_listings_pkey ON public.rns_listings USING btree (movie_id);

CREATE UNIQUE INDEX rns_listings_slug_key ON public.rns_listings USING btree (slug);

CREATE UNIQUE INDEX scrape_cursors_pkey ON public.scrape_cursors USING btree (key);

alter table "public"."rns_listings" add constraint "rns_listings_pkey" PRIMARY KEY using index "rns_listings_pkey";

alter table "public"."scrape_cursors" add constraint "scrape_cursors_pkey" PRIMARY KEY using index "scrape_cursors_pkey";

alter table "public"."rns_listings" add constraint "rns_listings_movie_id_fkey" FOREIGN KEY (movie_id) REFERENCES public.movies(id) ON DELETE CASCADE not valid;

alter table "public"."rns_listings" validate constraint "rns_listings_movie_id_fkey";

alter table "public"."rns_listings" add constraint "rns_listings_slug_key" UNIQUE using index "rns_listings_slug_key";

grant delete on table "public"."rns_listings" to "anon";

grant insert on table "public"."rns_listings" to "anon";

grant references on table "public"."rns_listings" to "anon";

grant select on table "public"."rns_listings" to "anon";

grant trigger on table "public"."rns_listings" to "anon";

grant truncate on table "public"."rns_listings" to "anon";

grant update on table "public"."rns_listings" to "anon";

grant delete on table "public"."rns_listings" to "authenticated";

grant insert on table "public"."rns_listings" to "authenticated";

grant references on table "public"."rns_listings" to "authenticated";

grant select on table "public"."rns_listings" to "authenticated";

grant trigger on table "public"."rns_listings" to "authenticated";

grant truncate on table "public"."rns_listings" to "authenticated";

grant update on table "public"."rns_listings" to "authenticated";

grant delete on table "public"."rns_listings" to "service_role";

grant insert on table "public"."rns_listings" to "service_role";

grant references on table "public"."rns_listings" to "service_role";

grant select on table "public"."rns_listings" to "service_role";

grant trigger on table "public"."rns_listings" to "service_role";

grant truncate on table "public"."rns_listings" to "service_role";

grant update on table "public"."rns_listings" to "service_role";

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


  create policy "rns_listings are publicly readable"
  on "public"."rns_listings"
  as permissive
  for select
  to public
using (true);



