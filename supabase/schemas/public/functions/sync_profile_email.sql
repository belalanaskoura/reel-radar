create or replace function public.sync_profile_email()
  returns trigger
  language plpgsql
  security definer
  AS $function$
BEGIN
  UPDATE profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$function$;

grant execute on function "public"."sync_profile_email"() to public, "anon", "authenticated", "postgres", "service_role";
