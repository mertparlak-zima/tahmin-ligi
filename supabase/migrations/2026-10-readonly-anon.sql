-- #7 — Salt-okunur lokal geliştirme: RLS + anon erişim.
-- SQL Editor'da çalıştır. Service key'i olmayan geliştirici SUPABASE_URL +
-- SUPABASE_ANON_KEY ile lokalde ÇALIŞABİLİR ama YAZAMAZ.

-- 1) Tablolarda RLS etkinleştir (service_role her zaman bypass eder).
alter table players enable row level security;
alter table matches enable row level security;
alter table predictions enable row level security;
alter table app_config enable row level security;
alter table sync_state enable row level security;

-- 2) Herkese açık OKUMA: matches, players, app_config (puanlama kuralı), sync_state.
--    Bunlar /api/league payload'ında zaten herkese açık.
create policy "anon read matches" on matches for select using (true);
create policy "anon read players" on players for select using (true);
create policy "anon read app_config" on app_config for select using (true);
create policy "anon read sync_state" on sync_state for select using (true);

-- 3) Predictions: MÜHÜR KURALI — yalnız kickoff geçmiş maçların tahminleri okunabilir.
--    Gelecek maçın tahmin sonucu (outcome) anon erişime KAPALI; kimin girdiği
--    payload'da zaten predictionsCount olarak herkese açık.
create policy "anon read revealed predictions" on predictions
  for select
  using (
    exists (
      select 1 from matches m
      where m.id = predictions.match_id
        and m.kickoff < now()
    )
  );

-- 4) YAZMA: anon için hiçbir INSERT/UPDATE/DELETE policy yok → yalnız service_role yazabilir.

-- Doğrulama:
-- select * from pg_policies where schemaname = 'public' order by tablename;
