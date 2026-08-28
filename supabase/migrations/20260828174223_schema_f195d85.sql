
  create table "public"."error_log" (
    "id" bigint generated always as identity not null,
    "source" text not null,
    "message" text not null,
    "stack" text,
    "context" jsonb,
    "occurred_at" timestamp with time zone not null default now()
      );


alter table "public"."error_log" enable row level security;

CREATE INDEX analytics_events_type_time_idx ON public.analytics_events USING btree (event_type, occurred_at DESC);

CREATE INDEX error_log_occurred_at_idx ON public.error_log USING btree (occurred_at DESC);

CREATE UNIQUE INDEX error_log_pkey ON public.error_log USING btree (id);

CREATE INDEX error_log_source_occurred_at_idx ON public.error_log USING btree (source, occurred_at DESC);

alter table "public"."error_log" add constraint "error_log_pkey" PRIMARY KEY using index "error_log_pkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.prune_error_log(p_keep_days integer DEFAULT 90)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_deleted integer;
begin
  delete from public.error_log
  where occurred_at < now() - make_interval(days => p_keep_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count integer;
begin
  insert into public.rate_limits as rl (key, count, window_start)
    values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else rl.count + 1 end,
        window_start = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else rl.window_start end
  returning rl.count into v_count;
  return v_count <= p_limit;
end; $function$
;

grant delete on table "public"."error_log" to "anon";

grant insert on table "public"."error_log" to "anon";

grant references on table "public"."error_log" to "anon";

grant select on table "public"."error_log" to "anon";

grant trigger on table "public"."error_log" to "anon";

grant truncate on table "public"."error_log" to "anon";

grant update on table "public"."error_log" to "anon";

grant delete on table "public"."error_log" to "authenticated";

grant insert on table "public"."error_log" to "authenticated";

grant references on table "public"."error_log" to "authenticated";

grant select on table "public"."error_log" to "authenticated";

grant trigger on table "public"."error_log" to "authenticated";

grant truncate on table "public"."error_log" to "authenticated";

grant update on table "public"."error_log" to "authenticated";

grant delete on table "public"."error_log" to "service_role";

grant insert on table "public"."error_log" to "service_role";

grant references on table "public"."error_log" to "service_role";

grant select on table "public"."error_log" to "service_role";

grant trigger on table "public"."error_log" to "service_role";

grant truncate on table "public"."error_log" to "service_role";

grant update on table "public"."error_log" to "service_role";


