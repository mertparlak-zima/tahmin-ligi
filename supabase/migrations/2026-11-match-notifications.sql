-- #29 Discord gece özeti: gönderilen maçların tek seferlik flag'i.
-- PK = match_id → aynı maçın özeti ikinci kez gönderilemez (api/notify.js
-- gönderimden sonra yazar; Discord başarısızsa yazılmaz → ertesi gece retry).

create table if not exists match_notifications (
  match_id    uuid primary key references matches (id) on delete cascade,
  league      text not null,
  season_year int,
  home_name   text not null,
  away_name   text not null,
  home_score  int,
  away_score  int,
  sent_at     timestamptz not null default now()
);

-- Yalnız service role yazar (öteki tablolarla aynı model; policy yok = anon
-- erişemez). Denetim için skor özeti satırda dondurulur.
alter table match_notifications enable row level security;

-- Kurulum tohumu: GEÇMİŞTE bitmiş maçlar "gönderilmiş" sayılır — ilk cron
-- turu tüm sezon geçmişini tek mesajda dökmesin. Bu andan sonra biten maçlar
-- flag'siz kalır ve ilk özete düşer.
insert into match_notifications (match_id, league, season_year, home_name, away_name, home_score, away_score)
select m.id, m.league, m.season_year, m.home_name, m.away_name, m.home_score, m.away_score
from matches m
where m.status in ('FINISHED', 'AWARDED')
  and m.home_score is not null
  and m.away_score is not null
on conflict (match_id) do nothing;
