-- Pati Nobeti - App ile uyumlu Supabase schema (fresh setup)
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  name text,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'passive')),
  created_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now(),
  unique (community_id, user_id)
);

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
  due_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists contributions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id uuid references profiles(id),
  amount numeric(12,2) not null,
  expense_id uuid references expenses(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
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

create index if not exists idx_community_members_community_id on community_members (community_id);
create index if not exists idx_feeding_points_community_id on feeding_points (community_id);
create index if not exists idx_animals_community_id on animals (community_id);
create index if not exists idx_feeding_logs_community_id on feeding_logs (community_id);
create index if not exists idx_feeding_logs_fed_at on feeding_logs (fed_at desc);
create index if not exists idx_expenses_community_id on expenses (community_id);
