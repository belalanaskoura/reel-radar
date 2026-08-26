create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (((old.email)::text IS DISTINCT FROM (new.email)::text))
  execute function public.sync_profile_email();
