create or replace function public.check_rate_limit (
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
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
end; $function$;

grant execute on function "public"."check_rate_limit"(text, integer, integer) to "postgres", "service_role";

revoke all on function "public"."check_rate_limit"(text, integer, integer) from public;
