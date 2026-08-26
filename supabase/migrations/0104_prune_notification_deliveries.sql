-- notification_deliveries has no retention at all, unlike analytics_events
-- (which had prune_analytics_events sitting dormant until /api/prune-
-- analytics started calling it). Fed by every notify path -- poll,
-- lineup, broadcast, new-release, admin-digest -- one row per user per
-- channel per notification, forever. This is the fastest-growing table in
-- the schema by construction, with no cleanup story until now. 180 days
-- (double analytics_events' 90) since delivery rows are read for the
-- admin notifications chart, which only ever looks at a 14-day window, so
-- there's no product reason to keep them indefinitely once they're this
-- far past any dashboard's read range.
create or replace function public.prune_notification_deliveries (
  p_keep_days integer default 180
)
  returns integer
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
declare
  v_deleted integer;
begin
  delete from public.notification_deliveries
  where created_at < now() - make_interval(days => p_keep_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

grant execute on function "public"."prune_notification_deliveries"(integer) to "postgres", "service_role";

revoke all on function "public"."prune_notification_deliveries"(integer) from public;
