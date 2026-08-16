-- Pati Uzat - Row Level Security policies
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
      and cm.status in ('active', 'approved')
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
        and me.status in ('active', 'approved')
        and target.user_id = p_profile_id
        and target.status in ('active', 'approved')
    );
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_app_admin, false) = true
  );
$$;

grant execute on function public.is_community_member(uuid) to authenticated;
grant execute on function public.is_community_admin(uuid) to authenticated;
grant execute on function public.can_access_profile(uuid) to authenticated;
grant execute on function public.is_app_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.feeding_points enable row level security;
alter table public.animals enable row level security;
alter table public.feeding_logs enable row level security;
alter table public.expenses enable row level security;
alter table public.contributions enable row level security;
alter table public.contribution_allocations enable row level security;
alter table public.community_join_requests enable row level security;
alter table public.global_veterinarians enable row level security;
alter table public.community_veterinarians enable row level security;
alter table public.user_devices enable row level security;
alter table public.notification_events enable row level security;

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
using (status = 'approved' or public.is_app_admin());

create policy communities_insert
on public.communities
for insert
to authenticated
with check (
  (created_by is null or created_by = auth.uid())
  and (
    status = 'pending'
    or public.is_app_admin()
  )
);

create policy communities_update_admin
on public.communities
for update
to authenticated
using (public.is_community_admin(id) or public.is_app_admin())
with check (public.is_community_admin(id) or public.is_app_admin());

create policy communities_delete_admin
on public.communities
for delete
to authenticated
using (public.is_community_admin(id) or public.is_app_admin());

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
  public.is_app_admin()
  or
  public.is_community_admin(community_id)
  or (
    user_id = auth.uid()
    and role = 'member'
    and status in ('pending', 'rejected')
  )
  or (
    user_id = auth.uid()
    and role = 'admin'
    and status = 'pending'
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
  or public.is_app_admin()
)
with check (
  public.is_community_admin(community_id)
  or public.is_app_admin()
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
using (
  public.is_community_admin(community_id)
  or (
    public.is_community_member(community_id)
    and fed_by = auth.uid()
  )
)
with check (
  public.is_community_admin(community_id)
  or (
    public.is_community_member(community_id)
    and fed_by = auth.uid()
  )
);

create policy feeding_logs_delete
on public.feeding_logs
for delete
to authenticated
using (public.is_community_admin(community_id));

drop policy if exists expenses_select on public.expenses;
drop policy if exists expenses_insert_member_or_admin on public.expenses;
drop policy if exists expenses_insert_admin on public.expenses;
drop policy if exists expenses_update_admin on public.expenses;
drop policy if exists expenses_delete_admin on public.expenses;

create policy expenses_select
on public.expenses
for select
to authenticated
using (
  public.is_community_admin(community_id)
  or (
    public.is_community_member(community_id)
    and (
      approval_status = 'approved'
      or submitted_by = auth.uid()
    )
  )
);

create policy expenses_insert_member_or_admin
on public.expenses
for insert
to authenticated
with check (
  public.is_community_member(community_id)
  and (
    (public.is_community_admin(community_id) and submitted_by is not null)
    or ((not public.is_community_admin(community_id)) and submitted_by = auth.uid())
  )
  and (
    receipt_url is not null
    or jsonb_array_length(coalesce(receipt_urls, '[]'::jsonb)) > 0
  )
  and (
    (public.is_community_admin(community_id) and approval_status in ('pending', 'approved'))
    or ((not public.is_community_admin(community_id)) and approval_status = 'pending')
  )
);

create policy expenses_update_admin
on public.expenses
for update
to authenticated
using (
  public.is_community_admin(community_id)
  or (
    public.is_community_member(community_id)
    and submitted_by = auth.uid()
    and approval_status = 'pending'
  )
)
with check (
  public.is_community_admin(community_id)
  or (
    public.is_community_member(community_id)
    and submitted_by = auth.uid()
    and approval_status = 'pending'
  )
);

create policy expenses_delete_admin
on public.expenses
for delete
to authenticated
using (
  public.is_community_admin(community_id)
  or (
    public.is_community_member(community_id)
    and submitted_by = auth.uid()
    and approval_status = 'pending'
  )
);

drop policy if exists contributions_select on public.contributions;
drop policy if exists contributions_insert on public.contributions;
drop policy if exists contributions_update_self on public.contributions;
drop policy if exists contributions_delete_admin on public.contributions;

create policy contributions_select
on public.contributions
for select
to authenticated
using (
  public.is_community_admin(community_id)
  or (
    public.is_community_member(community_id)
    and (
      approval_status = 'approved'
      or contributor_user_id = auth.uid()
    )
  )
);

create policy contributions_insert
on public.contributions
for insert
to authenticated
with check (
  public.is_community_member(community_id)
  and (
    (public.is_community_admin(community_id) and contributor_user_id is not null)
    or ((not public.is_community_admin(community_id)) and contributor_user_id = auth.uid())
  )
  and (
    receipt_url is not null
    or jsonb_array_length(coalesce(receipt_urls, '[]'::jsonb)) > 0
  )
  and approval_status = 'pending'
);

create policy contributions_update_self
on public.contributions
for update
to authenticated
using (
  public.is_community_admin(community_id)
)
with check (
  public.is_community_admin(community_id)
);

create policy contributions_delete_admin
on public.contributions
for delete
to authenticated
using (public.is_community_admin(community_id));

drop policy if exists contribution_allocations_select on public.contribution_allocations;
drop policy if exists contribution_allocations_insert on public.contribution_allocations;
drop policy if exists contribution_allocations_update on public.contribution_allocations;
drop policy if exists contribution_allocations_delete on public.contribution_allocations;

create policy contribution_allocations_select
on public.contribution_allocations
for select
to authenticated
using (
  public.is_community_admin(community_id)
  or exists (
    select 1
    from public.contributions c
    where c.id = contribution_allocations.contribution_id
      and c.community_id = contribution_allocations.community_id
      and public.is_community_member(contribution_allocations.community_id)
      and (
        c.approval_status = 'approved'
        or c.contributor_user_id = auth.uid()
      )
  )
);

create policy contribution_allocations_insert
on public.contribution_allocations
for insert
to authenticated
with check (
  public.is_community_admin(community_id)
);

create policy contribution_allocations_update
on public.contribution_allocations
for update
to authenticated
using (
  public.is_community_admin(community_id)
)
with check (
  public.is_community_admin(community_id)
);

create policy contribution_allocations_delete
on public.contribution_allocations
for delete
to authenticated
using (
  public.is_community_admin(community_id)
);

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

drop policy if exists global_veterinarians_select on public.global_veterinarians;
drop policy if exists global_veterinarians_insert_app_admin on public.global_veterinarians;
drop policy if exists global_veterinarians_update_app_admin on public.global_veterinarians;
drop policy if exists global_veterinarians_delete_app_admin on public.global_veterinarians;

create policy global_veterinarians_select
on public.global_veterinarians
for select
to authenticated
using (is_active = true or public.is_app_admin());

create policy global_veterinarians_insert_app_admin
on public.global_veterinarians
for insert
to authenticated
with check (public.is_app_admin());

create policy global_veterinarians_update_app_admin
on public.global_veterinarians
for update
to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

create policy global_veterinarians_delete_app_admin
on public.global_veterinarians
for delete
to authenticated
using (public.is_app_admin());

drop policy if exists community_veterinarians_select on public.community_veterinarians;
drop policy if exists community_veterinarians_insert_admin on public.community_veterinarians;
drop policy if exists community_veterinarians_update_admin on public.community_veterinarians;
drop policy if exists community_veterinarians_delete_admin on public.community_veterinarians;

create policy community_veterinarians_select
on public.community_veterinarians
for select
to authenticated
using (public.is_community_member(community_id));

create policy community_veterinarians_insert_admin
on public.community_veterinarians
for insert
to authenticated
with check (public.is_community_admin(community_id));

create policy community_veterinarians_update_admin
on public.community_veterinarians
for update
to authenticated
using (public.is_community_admin(community_id))
with check (public.is_community_admin(community_id));

create policy community_veterinarians_delete_admin
on public.community_veterinarians
for delete
to authenticated
using (public.is_community_admin(community_id));

drop policy if exists user_devices_select_self on public.user_devices;
drop policy if exists user_devices_insert_self on public.user_devices;
drop policy if exists user_devices_update_self on public.user_devices;
drop policy if exists user_devices_delete_self on public.user_devices;

create policy user_devices_select_self
on public.user_devices
for select
to authenticated
using (user_id = auth.uid());

create policy user_devices_insert_self
on public.user_devices
for insert
to authenticated
with check (user_id = auth.uid());

create policy user_devices_update_self
on public.user_devices
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy user_devices_delete_self
on public.user_devices
for delete
to authenticated
using (user_id = auth.uid());
