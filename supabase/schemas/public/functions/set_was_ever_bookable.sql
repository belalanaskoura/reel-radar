create or replace function public.set_was_ever_bookable()
  returns trigger
  language plpgsql
  AS $function$
begin
  if new.bookable = true then
    new.was_ever_bookable := true;
  end if;
  return new;
end;
$function$;

grant execute on function "public"."set_was_ever_bookable"() to public, "anon", "authenticated", "postgres", "service_role";
