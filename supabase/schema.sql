-- Seepify (Seep) game persistence schema for Supabase (Postgres)
-- Run this in the Supabase SQL editor of a free project.
--
-- Architecture note: Seepify has no backend server. The room host's browser
-- runs the authoritative game engine and writes finished-game results
-- directly to Supabase using the ANON key. That means these tables accept
-- inserts from the anon role (RLS policies below) rather than being locked
-- to a service-role key. There's nothing sensitive stored here (display
-- names, scores, badges), so this is an acceptable trust model for a casual
-- game - don't reuse this schema as-is for anything with real user data.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  winner_team smallint,
  target_margin int not null default 100,
  deals_played int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  seat smallint not null,
  team_id smallint not null,
  is_bot boolean not null default false,
  bot_difficulty text,
  display_name text not null,
  won boolean not null default false
);

create table if not exists badges (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  description text not null,
  icon text not null default 'star'
);

insert into badges (key, name, description, icon) values
  ('first_win', 'First Baazi', 'Won your first Baazi', 'trophy'),
  ('sweep_master', 'Sweep Master', 'Made 2 or more sweeps in a single Baazi', 'zap'),
  ('century', 'Century', 'Won a Baazi by a margin of 100+', 'flame')
on conflict (key) do nothing;

create table if not exists profile_badges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  badge_id uuid not null references badges(id) on delete cascade,
  game_id uuid references games(id) on delete set null,
  awarded_at timestamptz not null default now(),
  unique (profile_id, badge_id)
);

alter table profiles enable row level security;
alter table games enable row level security;
alter table game_players enable row level security;
alter table profile_badges enable row level security;
alter table badges enable row level security;

-- Read access: anyone (used for profile summaries / badge cabinets).
create policy "public read profiles" on profiles for select using (true);
create policy "public read games" on games for select using (true);
create policy "public read game_players" on game_players for select using (true);
create policy "public read badges" on badges for select using (true);
create policy "public read profile_badges" on profile_badges for select using (true);

-- Write access: the host's browser writes these directly with the anon key
-- once a Baazi finishes. No update/delete policies are granted beyond what's
-- needed (profiles can update their own display name by device_id).
create policy "public insert profiles" on profiles for insert with check (true);
create policy "public update own profile" on profiles for update using (true) with check (true);
create policy "public insert games" on games for insert with check (true);
create policy "public insert game_players" on game_players for insert with check (true);
create policy "public insert profile_badges" on profile_badges for insert with check (true);
