-- #18 PR2 — Sezon/lig boyutları (kod deploy'undan ÖNCE SQL Editor'da çalıştır).
-- Dondurulmuş flag'ler: season_year ilk yazımda hesaplanır, uygulama sonradan
-- değiştirmez (ertelenen maçlar eski sezon aidiyetini korur). league benzer
-- şekilde dondurulur; yeni ligler eklendikçe LEAGUES kayıt defteriyla eşleşir.

alter table matches add column if not exists season_year int;
alter table matches add column if not exists league text not null default 'EU';

-- Geri doldurma: UEFA sezonu 1 Temmuz kuralı, ESPN seasonYear() ile aynı
-- (UTC bazlı; lib/espn.js getUTCMonth kullanır).
update matches set season_year = case
  when extract(month from kickoff at time zone 'UTC') >= 7
    then extract(year  from kickoff at time zone 'UTC')
  else extract(year  from kickoff at time zone 'UTC') - 1
end
where season_year is null;

create index if not exists matches_league_season_idx on matches (league, season_year);

-- Bonus puanların sezonlaştırılması (#18 P2-bonus): mevcut players.bonus_points
-- değerleri AKTİF sezona taşınır; kolon legacy olarak kalır, kod artık
-- app_config'ten okur. Bonusu sıfırdan farklı oyuncu yoksa satır oluşmaz.
insert into app_config (key, value)
select
  'bonus:' || (case
    when extract(month from now() at time zone 'UTC') >= 7
      then extract(year from now() at time zone 'UTC')
    else extract(year from now() at time zone 'UTC') - 1
  end)::text,
  jsonb_object_agg(id, bonus_points)
from players
where bonus_points is not null and bonus_points <> 0
on conflict (key) do nothing;

-- Doğrulama (manuel): select league, season_year, count(*) from matches group by 1,2;
