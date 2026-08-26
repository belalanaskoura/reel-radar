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
