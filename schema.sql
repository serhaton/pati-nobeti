-- Pati Nobeti - App ile uyumlu Supabase schema (fresh setup)
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  name text,
  phone text,
  avatar_url text,
  is_app_admin boolean not null default false,
  status text not null default 'active' check (status in ('active', 'passive')),
  created_at timestamptz not null default now()
);

alter table profiles
  add column if not exists is_app_admin boolean not null default false,
  add column if not exists phone text;

create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  neighborhood text,
  latitude double precision,
  longitude double precision,
  default_zoom integer not null default 17,
  cover_url text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'active' check (status in ('active', 'passive', 'pending', 'approved', 'rejected')),
  full_name text,
  phone text,
  photo_url text,
  created_at timestamptz not null default now(),
  unique (community_id, user_id)
);

alter table community_members
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists photo_url text;

create table if not exists feeding_points (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  name text not null,
  animal_type text not null default 'both' check (animal_type in ('cat', 'dog', 'both')),
  latitude double precision not null,
  longitude double precision not null,
  status text,
  photo_uri text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists animals (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  name text,
  animal_type text not null check (animal_type in ('cat', 'dog')),
  cins text,
  color text,
  gender text,
  neutered boolean,
  birth_date date,
  location text,
  photo_url text,
  notes text,
  feeding_point_id uuid references feeding_points(id),
  created_at timestamptz not null default now()
);

create table if not exists feeding_logs (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  feeding_point_id uuid not null references feeding_points(id) on delete cascade,
  fed_by uuid references profiles(id),
  feeder_name text,
  fed_at timestamptz not null default now(),
  food_type text,
  quantity text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  category text not null check (category in ('food', 'vet', 'medicine', 'other', 'Mama', 'Veteriner', 'Ilac', 'Diger')),
  title text not null,
  amount numeric(12,2) not null,
  paid_by uuid references profiles(id),
  vendor text,
  receipt_url text,
  receipt_urls jsonb not null default '[]'::jsonb,
  due_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists contributions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id uuid references profiles(id),
  contributor_user_id uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  amount numeric(12,2) not null,
  transfer_at timestamptz not null default now(),
  receipt_url text,
  receipt_urls jsonb not null default '[]'::jsonb,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  expense_id uuid references expenses(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists contribution_allocations (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  contribution_id uuid not null references contributions(id) on delete cascade,
  expense_id uuid not null references expenses(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  allocated_by uuid references profiles(id) on delete set null,
  allocated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table contributions
  add column if not exists contributor_user_id uuid references profiles(id) on delete set null,
  add column if not exists created_by uuid references profiles(id) on delete set null,
  add column if not exists transfer_at timestamptz not null default now(),
  add column if not exists receipt_url text,
  add column if not exists receipt_urls jsonb not null default '[]'::jsonb,
  add column if not exists approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists approved_by uuid references profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

update contributions
set contributor_user_id = user_id
where contributor_user_id is null
  and user_id is not null;

update contributions
set receipt_urls = jsonb_build_array(receipt_url)
where receipt_url is not null
  and receipt_url <> ''
  and receipt_urls = '[]'::jsonb;

insert into contribution_allocations (community_id, contribution_id, expense_id, amount)
select c.community_id, c.id, c.expense_id, round(c.amount::numeric, 2)
from contributions c
where c.expense_id is not null
  and c.approval_status = 'approved'
  and not exists (
    select 1
    from contribution_allocations ca
    where ca.contribution_id = c.id
  );

create table if not exists community_join_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  requester_name text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (community_id, user_id)
);

create table if not exists global_veterinarians (
  id uuid primary key default gen_random_uuid(),
  clinic_name text not null,
  default_veterinarian_name text not null,
  default_phone text not null,
  location_label text not null,
  latitude double precision not null,
  longitude double precision not null,
  city text,
  district text,
  source text,
  verified boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists community_veterinarians (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  global_veterinarian_id uuid not null references global_veterinarians(id) on delete restrict,
  override_veterinarian_name text,
  override_phone text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, global_veterinarian_id)
);

alter table expenses
  add column if not exists expense_type text check (expense_type in ('mama', 'veteriner', 'diger')),
  add column if not exists community_veterinarian_id uuid references community_veterinarians(id) on delete set null,
  add column if not exists vendor_text text,
  add column if not exists receipt_urls jsonb not null default '[]'::jsonb,
  add column if not exists expense_at timestamptz not null default now(),
  add column if not exists note text,
  add column if not exists submitted_by uuid references profiles(id) on delete set null,
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists approval_status text not null default 'approved' check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists approved_by uuid references profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

update expenses
set receipt_urls = jsonb_build_array(receipt_url)
where receipt_url is not null
  and receipt_url <> ''
  and receipt_urls = '[]'::jsonb;

alter table expenses
  drop constraint if exists expenses_expense_type_check;

alter table expenses
  add constraint expenses_expense_type_check check (expense_type in ('mama', 'veteriner', 'diger'));

alter table expenses
  alter column amount type numeric(12,2) using round(coalesce(amount, 0)::numeric, 2),
  alter column due_amount type numeric(12,2) using round(coalesce(due_amount, 0)::numeric, 2);

create index if not exists idx_community_members_community_id on community_members (community_id);
create index if not exists idx_feeding_points_community_id on feeding_points (community_id);
create index if not exists idx_animals_community_id on animals (community_id);
create index if not exists idx_feeding_logs_community_id on feeding_logs (community_id);
create index if not exists idx_feeding_logs_fed_at on feeding_logs (fed_at desc);
create index if not exists idx_expenses_community_id on expenses (community_id);
create index if not exists idx_expenses_approval_status on expenses (approval_status);
create index if not exists idx_expenses_community_veterinarian_id on expenses (community_veterinarian_id);
create index if not exists idx_contributions_community_id on contributions (community_id);
create index if not exists idx_contributions_approval_status on contributions (approval_status);
create index if not exists idx_contributions_expense_id on contributions (expense_id);
create index if not exists idx_contribution_allocations_community_id on contribution_allocations (community_id);
create index if not exists idx_contribution_allocations_contribution_id on contribution_allocations (contribution_id);
create index if not exists idx_contribution_allocations_expense_id on contribution_allocations (expense_id);
create index if not exists idx_global_veterinarians_active on global_veterinarians (is_active);
create index if not exists idx_global_veterinarians_location on global_veterinarians (latitude, longitude);
create index if not exists idx_community_veterinarians_community_id on community_veterinarians (community_id);
create index if not exists idx_community_veterinarians_global_vet_id on community_veterinarians (global_veterinarian_id);
