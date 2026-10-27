-- #24 T3 review — predictions.player_id FK'sı CASCADE → RESTRICT.
-- Neden: oyuncu silme ucu artık herkese açık; "tahmin sayısı 0" kontrolü ile
-- DELETE arasında concurrent tahmin yazımı cascade ile elle girilmiş
-- tahminleri sessizce silebiliyordu. RESTRICT ile bu pencere kapanır —
-- API (api/players.js) 23503'ü 409'a çevirir. Kod deploy'undan ÖNCE
-- SQL Editor'da çalıştırılmalı (RESTRICT önce gelirse mevcut kod yolunda
-- fark yok; CASCADE kalırsa pencere açık kalır).

alter table predictions
  drop constraint if exists predictions_player_id_fkey;

alter table predictions
  add constraint predictions_player_id_fkey
  foreign key (player_id) references players (id) on delete restrict;

-- Doğrulama (manuel):
-- select conname, confdeltype from pg_constraint
--   where conrelid = 'predictions'::regclass and contype = 'f'; -- confdeltype = 'r'
