-- Pati Uzat - Auth triggers
-- Run this after schema.sql

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, username, full_name, name, status)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'username', new.email),
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
      coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
      'active'
    )
    on conflict (id) do update
    set
      username = coalesce(excluded.username, public.profiles.username),
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      name = coalesce(excluded.name, public.profiles.name);
  exception
    when others then
      -- Never block auth signup because of profile sync issues.
      raise warning 'handle_new_user failed for user %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Optional backfill for users created before this trigger existed.
insert into public.profiles (id, username, full_name, name, status)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'username', u.email),
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
  coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
  'active'
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
);
