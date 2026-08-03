-- 1. Create the single user in Supabase Dashboard > Authentication > Users.
-- 2. Replace the email below and run this block once in the SQL editor.

do $$
declare
  target_user_id uuid;
begin
  select id
    into target_user_id
  from auth.users
  where lower(email) = lower('you@example.com')
  limit 1;

  if target_user_id is null then
    raise exception 'No Supabase Auth user found for the configured email.';
  end if;

  insert into public.app_owners (user_id)
  values (target_user_id)
  on conflict (user_id) do nothing;
end $$;
