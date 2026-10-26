-- #21 — Süper Lig (TSL) ikinci tahmin ligi olarak eklenir (kod deploy'undan
-- ÖNCE SQL Editor'da çalıştır; 2026-10-season-league.sql desenini izler).
-- İki adım: (1) matches.competition check'ine 'TSL' eklenir; (2) sezonluk
-- bonus anahtarları lig kapsamına kopyalanır (bonus:<yil> → bonus:EU:<yil>).
-- Puanlama kuralı (`scoring`) KÜRESEL kalır — lig bazlı anahtara taşınmaz.

-- 1) Turnuva check'inin genişletilmesi (drop + recreate; idempotent).
--    Adı Postgres varsayılanıdır (inline column check: <tablo>_<kolon>_check).
alter table matches drop constraint if exists matches_competition_check;
alter table matches add constraint matches_competition_check
  check (competition in ('CL', 'EL', 'UECL', 'TSL'));

-- 2) Bonus anahtarlarının lig kapsamına alınması: mevcut `bonus:<yil>`
--    değerleri `bonus:EU:<yil>` olarak kopyalanır (hedef anahtar yoksa).
--    Eski anahtar SİLİNMEZ — göç penceresinde geri alma güvenliği ve kodun
--    eski biçime düşüşü (yalnız EU okur) için kalır. Yeni biçim:
--    `bonus:<lig>:<sezon>` (örn. bonus:TSL:2026).
do $$
begin
  insert into app_config (key, value)
  select 'bonus:EU:' || right(key, 4), value
  from app_config
  where key ~ '^bonus:[0-9]{4}$'
  on conflict (key) do nothing;
end
$$;

-- Doğrulama (manuel):
--   select key from app_config where key like 'bonus%' order by key;
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'matches'::regclass and conname = 'matches_competition_check';
