create or replace function public.prune_rate_limits()
returns void
language sql
security definer
set search_path = public
as $function$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$function$;

revoke all on function public.prune_rate_limits() from public, anon, authenticated;
