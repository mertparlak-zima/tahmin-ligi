-- Tahmin Ligi — Supabase (Postgres) şeması
-- Supabase Dashboard > SQL Editor'da tek seferde çalıştırılır.

create extension if not exists pgcrypto;

create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text not null default '#b8f34a',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id                   uuid primary key default gen_random_uuid(),
  provider             text not null default 'espn',
  external_id          text not null,
  competition          text not null check (competition in ('CL', 'EL', 'UECL')),
  kickoff              timestamptz not null,
  status               text not null default 'SCHEDULED',
  minute               int,
  home_name            text not null,
  home_short           text,
  home_tla             text,
  home_crest           text,
  away_name            text not null,
  away_short           text,
  away_tla             text,
  away_crest           text,
  home_score           int,
  away_score           int,
  matchday             int,
  stage                text,
  last_provider_update timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider, external_id)
);

create index if not exists matches_kickoff_idx on matches (kickoff);
create index if not exists matches_status_idx on matches (status);

create table if not exists predictions (
  player_id  uuid not null references players (id) on delete cascade,
  match_id   uuid not null references matches (id) on delete cascade,
  outcome    char(1) not null check (outcome in ('H', 'D', 'A')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, match_id)
);

create table if not exists app_config (
  key   text primary key,
  value jsonb not null
);

insert into app_config (key, value)
values ('scoring', '{"label":"Doğru sonuç 1 puan","status":"provisional","correctOutcome":1}'::jsonb)
on conflict (key) do nothing;

create table if not exists sync_state (
  id              int primary key default 1 check (id = 1),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error      text,
  matches_seen    int not null default 0,
  updated_at      timestamptz not null default now()
);

insert into sync_state (id) values (1) on conflict (id) do nothing;
