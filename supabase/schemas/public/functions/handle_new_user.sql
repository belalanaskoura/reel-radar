create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$function$;

grant execute on function "public"."handle_new_user"() to public, "anon", "authenticated", "postgres", "service_role";
