-- Tahmin Ligi — Supabase (Postgres) şeması
-- Supabase Dashboard > SQL Editor'da tek seferde çalıştırılır.

create extension if not exists pgcrypto;

create table if not exists players (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  color        text not null default '#b8f34a',
  -- #17 profil fotoğrafı: Supabase Storage public URL'i (nullable, varsayılan yok).
  -- Mevcut kurulumlarda migrations/ SQL'i ile eklenir.
  avatar_url   text,
  is_active    boolean not null default true,
  bonus_points int not null default 0,
  created_at   timestamptz not null default now()
);

-- "Ali" ile "ali" aynı oyuncu sayılır: benzersizlik küçük harfe göre.
create unique index if not exists players_name_key on players (lower(name));

create table if not exists matches (
  id                   uuid primary key default gen_random_uuid(),
  provider             text not null default 'espn',
  external_id          text not null,
  -- #21: 'TSL' = Süper Lig (tur.1, tüm fikstür). Lig→turnuva eşlemesi
  -- lib/targets.js LEAGUE_COMPETITIONS'te.
  competition          text not null check (competition in ('CL', 'EL', 'UECL', 'TSL')),
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
  -- Dondurulmuş boyut flag'leri (#18): insert anında yazılır, sonradan
  -- değişmez. Mevcut kurulumlarda migrations/ SQL'i ile eklenir.
  season_year          int,
  -- Tahmin ligi (#21): 'EU' (Avrupa) | 'TSL' (Süper Lig) — lib/targets.js LEAGUES.
  league               text not null default 'EU',
  last_provider_update timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider, external_id)
);

create index if not exists matches_kickoff_idx on matches (kickoff);
create index if not exists matches_status_idx on matches (status);
create index if not exists matches_league_season_idx on matches (league, season_year);

create table if not exists predictions (
  -- #24: RESTRICT — public oyuncu silmede yarış penceresi (sayım→DELETE
  -- arası concurrent tahmin yazımı) cascade kaybını engeller (bkv.
  -- migrations/2026-11-players-restrict.sql).
  player_id  uuid not null references players (id) on delete restrict,
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

-- app_config anahtar biçimleri (#21):
--   'scoring'               — KÜRESEL puanlama kuralı (lig bazlı DEĞİL).
--   'bonus:<lig>:<sezon>'   — lig+sezonluk bonuslar, {playerId: puan}
--                             (örn. 'bonus:EU:2026', 'bonus:TSL:2026').
--   'bonus:<sezon>'         — göç öncesi eski biçim; yalnız EU yedeği olarak
--                             okunur (2026-11-super-lig.sql göçünü izler).

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
