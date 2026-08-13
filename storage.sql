-- Pati Nobeti - Supabase Storage setup
-- Run once in Supabase SQL Editor

insert into storage.buckets (id, name, public)
values ('app-images', 'app-images', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists storage_app_images_select on storage.objects;
drop policy if exists storage_app_images_insert on storage.objects;
drop policy if exists storage_app_images_update on storage.objects;
drop policy if exists storage_app_images_delete on storage.objects;

create policy storage_app_images_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'app-images'
  and exists (
    select 1
    from public.community_members cm
    where cm.user_id = auth.uid()
      and cm.status in ('active', 'approved')
      and cm.community_id::text = split_part(name, '/', 1)
  )
);

create policy storage_app_images_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'app-images'
  and owner = auth.uid()
  and exists (
    select 1
    from public.community_members cm
    where cm.user_id = auth.uid()
      and cm.status in ('active', 'approved')
      and cm.community_id::text = split_part(name, '/', 1)
  )
);

create policy storage_app_images_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'app-images'
  and owner = auth.uid()
  and exists (
    select 1
    from public.community_members cm
    where cm.user_id = auth.uid()
      and cm.status in ('active', 'approved')
      and cm.community_id::text = split_part(name, '/', 1)
  )
)
with check (
  bucket_id = 'app-images'
  and owner = auth.uid()
  and exists (
    select 1
    from public.community_members cm
    where cm.user_id = auth.uid()
      and cm.status in ('active', 'approved')
      and cm.community_id::text = split_part(name, '/', 1)
  )
);

create policy storage_app_images_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'app-images'
  and owner = auth.uid()
  and exists (
    select 1
    from public.community_members cm
    where cm.user_id = auth.uid()
      and cm.status in ('active', 'approved')
  )
);
