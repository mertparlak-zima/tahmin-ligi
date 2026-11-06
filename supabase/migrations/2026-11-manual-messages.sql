-- /maho gizli sohbet sayfası: Discord'a DÜŞEN manuel mesajların moderasyon
-- kaydı (bkv. api/maho.js). Tablo = "Discord'a iletilenler" — Discord
-- gönderimi başarısızsa satır YAZILMAZ (kullanıcı yeniden dener).
-- name nullable: boş bırakılırsa webhook varsayılan adıyla gitti (override yok).

create table if not exists manual_messages (
  id         bigint generated always as identity primary key,
  text       text not null,
  name       text,
  created_at timestamptz not null default now()
);

-- Moderasyon sorguları (yeniden eskiye) için.
create index if not exists manual_messages_created_idx on manual_messages (created_at);

-- Yalnız service role yazar (öteki tablolarla aynı model; policy yok = anon
-- erişemez).
alter table manual_messages enable row level security;
