create or replace function public.prune_analytics_events (
  p_keep_days integer default 90
)
  returns integer
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
declare
  v_deleted integer;
begin
  delete from public.analytics_events
  where occurred_at < now() - make_interval(days => p_keep_days)
    and event_type not in ('admin_digest_run', 'welcome_email_sent');

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

grant execute on function "public"."prune_analytics_events"(integer) to "postgres", "service_role";

revoke all on function "public"."prune_analytics_events"(integer) from public;
