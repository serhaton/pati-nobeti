-- Pati Nobeti - Row Level Security policies
-- Run this after schema.sql

create or replace function public.is_community_member(p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = auth.uid()
      and cm.status in ('active', 'passive', 'approved')
  );
$$;

create or replace function public.is_community_admin(p_community_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_members cm
    where cm.community_id = p_community_id
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
      and cm.status in ('active', 'approved')
  );
$$;

create or replace function public.can_access_profile(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    p_profile_id = auth.uid()
    or exists (
      select 1
      from public.community_members me
      join public.community_members target
        on target.community_id = me.community_id
      where me.user_id = auth.uid()
        and me.status in ('active', 'passive', 'approved')
        and target.user_id = p_profile_id
        and target.status in ('active', 'passive', 'approved')
    );
$$;

grant execute on function public.is_community_member(uuid) to authenticated;
grant execute on function public.is_community_admin(uuid) to authenticated;
grant execute on function public.can_access_profile(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.feeding_points enable row level security;
alter table public.animals enable row level security;
alter table public.feeding_logs enable row level security;
alter table public.expenses enable row level security;
alter table public.contributions enable row level security;
alter table public.community_join_requests enable row level security;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_select
on public.profiles
for select
to authenticated
using (public.can_access_profile(id));

create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists communities_select on public.communities;
drop policy if exists communities_insert on public.communities;
drop policy if exists communities_update_admin on public.communities;
drop policy if exists communities_delete_admin on public.communities;

create policy communities_select
on public.communities
for select
to authenticated
using (true);

create policy communities_insert
on public.communities
for insert
to authenticated
with check (created_by is null or created_by = auth.uid());

create policy communities_update_admin
on public.communities
for update
to authenticated
using (public.is_community_admin(id))
with check (public.is_community_admin(id));

create policy communities_delete_admin
on public.communities
for delete
to authenticated
using (public.is_community_admin(id));

drop policy if exists community_members_select on public.community_members;
drop policy if exists community_members_insert on public.community_members;
drop policy if exists community_members_update on public.community_members;
drop policy if exists community_members_delete on public.community_members;

create policy community_members_select
on public.community_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_community_member(community_id)
);

create policy community_members_insert
on public.community_members
for insert
to authenticated
with check (
  public.is_community_admin(community_id)
  or (
    user_id = auth.uid()
    and role = 'member'
    and status in ('pending', 'rejected')
  )
  or (
    user_id = auth.uid()
    and role = 'admin'
    and status = 'active'
    and exists (
      select 1
      from public.communities c
      where c.id = community_id
        and c.created_by = auth.uid()
    )
  )
);

create policy community_members_update
on public.community_members
for update
to authenticated
using (
  user_id = auth.uid()
  or public.is_community_admin(community_id)
)
with check (
  public.is_community_admin(community_id)
  or (
    user_id = auth.uid()
    and role = 'member'
    and status in ('pending', 'rejected')
  )
);

create policy community_members_delete
on public.community_members
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_community_admin(community_id)
);

drop policy if exists feeding_points_select on public.feeding_points;
drop policy if exists feeding_points_insert on public.feeding_points;
drop policy if exists feeding_points_update on public.feeding_points;
drop policy if exists feeding_points_delete on public.feeding_points;

create policy feeding_points_select
on public.feeding_points
for select
to authenticated
using (public.is_community_member(community_id));

create policy feeding_points_insert
on public.feeding_points
for insert
to authenticated
with check (public.is_community_member(community_id));

create policy feeding_points_update
on public.feeding_points
for update
to authenticated
using (public.is_community_admin(community_id))
with check (public.is_community_admin(community_id));

create policy feeding_points_delete
on public.feeding_points
for delete
to authenticated
using (public.is_community_admin(community_id));

drop policy if exists animals_select on public.animals;
drop policy if exists animals_insert_admin on public.animals;
drop policy if exists animals_update_admin on public.animals;
drop policy if exists animals_delete_admin on public.animals;

create policy animals_select
on public.animals
for select
to authenticated
using (public.is_community_member(community_id));

create policy animals_insert_admin
on public.animals
for insert
to authenticated
with check (public.is_community_admin(community_id));

create policy animals_update_admin
on public.animals
for update
to authenticated
using (public.is_community_admin(community_id))
with check (public.is_community_admin(community_id));

create policy animals_delete_admin
on public.animals
for delete
to authenticated
using (public.is_community_admin(community_id));

drop policy if exists feeding_logs_select on public.feeding_logs;
drop policy if exists feeding_logs_insert on public.feeding_logs;
drop policy if exists feeding_logs_update on public.feeding_logs;
drop policy if exists feeding_logs_delete on public.feeding_logs;

create policy feeding_logs_select
on public.feeding_logs
for select
to authenticated
using (public.is_community_member(community_id));

create policy feeding_logs_insert
on public.feeding_logs
for insert
to authenticated
with check (
  public.is_community_member(community_id)
  and (fed_by is null or fed_by = auth.uid())
);

create policy feeding_logs_update
on public.feeding_logs
for update
to authenticated
using (public.is_community_member(community_id))
with check (
  public.is_community_member(community_id)
  and (fed_by is null or fed_by = auth.uid())
);

create policy feeding_logs_delete
on public.feeding_logs
for delete
to authenticated
using (public.is_community_admin(community_id));

drop policy if exists expenses_select on public.expenses;
drop policy if exists expenses_insert_admin on public.expenses;
drop policy if exists expenses_update_admin on public.expenses;
drop policy if exists expenses_delete_admin on public.expenses;

create policy expenses_select
on public.expenses
for select
to authenticated
using (public.is_community_member(community_id));

create policy expenses_insert_admin
on public.expenses
for insert
to authenticated
with check (public.is_community_admin(community_id));

create policy expenses_update_admin
on public.expenses
for update
to authenticated
using (public.is_community_admin(community_id))
with check (public.is_community_admin(community_id));

create policy expenses_delete_admin
on public.expenses
for delete
to authenticated
using (public.is_community_admin(community_id));

drop policy if exists contributions_select on public.contributions;
drop policy if exists contributions_insert on public.contributions;
drop policy if exists contributions_update_self on public.contributions;
drop policy if exists contributions_delete_admin on public.contributions;

create policy contributions_select
on public.contributions
for select
to authenticated
using (public.is_community_member(community_id));

create policy contributions_insert
on public.contributions
for insert
to authenticated
with check (
  public.is_community_member(community_id)
  and (user_id is null or user_id = auth.uid())
);

create policy contributions_update_self
on public.contributions
for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_community_member(community_id)
)
with check (
  user_id = auth.uid()
  and public.is_community_member(community_id)
);

create policy contributions_delete_admin
on public.contributions
for delete
to authenticated
using (public.is_community_admin(community_id));

drop policy if exists community_join_requests_select on public.community_join_requests;
drop policy if exists community_join_requests_insert on public.community_join_requests;
drop policy if exists community_join_requests_update_admin on public.community_join_requests;
drop policy if exists community_join_requests_delete on public.community_join_requests;

create policy community_join_requests_select
on public.community_join_requests
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_community_admin(community_id)
);

create policy community_join_requests_insert
on public.community_join_requests
for insert
to authenticated
with check (user_id = auth.uid());

create policy community_join_requests_update_admin
on public.community_join_requests
for update
to authenticated
using (public.is_community_admin(community_id))
with check (public.is_community_admin(community_id));

create policy community_join_requests_delete
on public.community_join_requests
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_community_admin(community_id)
);
