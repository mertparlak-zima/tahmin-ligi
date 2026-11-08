-- İşlem Geçmişi (#40): tahmin hareketlerinin denetim kaydı (bkv. api/predictions.js
-- → lib/events.js). Her CREATE/UPDATE/DELETE bir satır; no-op (değer DEĞİŞMEYEN
-- yeniden kayıt, ör. H→H toplu form gönderimi) YAZILMAZ.
-- Tam IP + konum + User-Agent yalnız BU tabloda saklanır; /api/events istemciye
-- MASKELİ IP verir (85.110.••.••) — tam IP'e yalnız DB'den bakılır (sahibi
-- kararı, 2026-11-06). Backfill yok: tablo deploy anından itibaren birikir.

create table if not exists prediction_events (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references players (id) on delete cascade,
  match_id    uuid not null references matches (id) on delete cascade,
  action      text not null check (action in ('CREATE', 'UPDATE', 'DELETE')),
  old_outcome char(1),
  new_outcome char(1),
  ip          text,
  ip_city     text,
  ip_country  text,
  ip_region   text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- İşlem Geçmişi listesi (yeniden eskiye) — lib/events.js order(created_at desc).
create index if not exists prediction_events_created_idx on prediction_events (created_at desc);

-- Yalnız service role yazar (öteki tablolarla aynı model; policy yok = anon
-- erişemez).
alter table prediction_events enable row level security;
