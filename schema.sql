-- Pati Nöbeti için önerilen Supabase veri modeli
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  avatar_url text,
  created_at timestamptz default now()
);

create table communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  neighborhood text,
  cover_url text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table community_members (
  community_id uuid references communities(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now(),
  primary key (community_id, user_id)
);

create table feeding_points (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade,
  name text not null,
  animal_type text not null check (animal_type in ('cat','dog','both')),
  latitude double precision not null,
  longitude double precision not null,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table animals (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade,
  name text,
  animal_type text not null check (animal_type in ('cat','dog')),
  photo_url text,
  color text,
  gender text,
  neutered boolean,
  notes text,
  feeding_point_id uuid references feeding_points(id),
  created_at timestamptz default now()
);

create table feeding_logs (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade,
  feeding_point_id uuid references feeding_points(id),
  fed_by uuid references profiles(id),
  fed_at timestamptz default now(),
  food_type text,
  quantity text,
  notes text
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade,
  category text not null check (category in ('food','vet','medicine','other')),
  title text not null,
  amount numeric(12,2) not null,
  paid_by uuid references profiles(id),
  vendor text,
  receipt_url text,
  due_amount numeric(12,2) default 0,
  created_at timestamptz default now()
);

create table contributions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade,
  user_id uuid references profiles(id),
  amount numeric(12,2) not null,
  expense_id uuid references expenses(id),
  note text,
  created_at timestamptz default now()
);

create table community_join_requests (
  community_id uuid references communities(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz default now(),
  primary key (community_id, user_id)
);
