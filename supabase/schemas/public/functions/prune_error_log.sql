create or replace function public.prune_error_log (
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
  delete from public.error_log
  where occurred_at < now() - make_interval(days => p_keep_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

grant execute on function "public"."prune_error_log"(integer) to "postgres", "service_role";

revoke all on function "public"."prune_error_log"(integer) from public;
