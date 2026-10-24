-- #17 — Profil fotoğrafları: Supabase Storage bucket.
-- SQL Editor'da çalıştır (koddan önce ya da sonra fark etmez; bucket olmadan
-- yüklemeler net Türkçe hatayla reddedilir, site fallback avatarla çalışır).

-- Public okuma (herkese görünür URL), yazma yalnız service_role (bizim API).
-- Bucket düzeyi ikinci savunma: 500KB + MIME beyaz listesi.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  524288, -- 512 KB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 524288,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Not: public bucket'ta okuma için ek politika gerekmez; yazma için politika
-- AÇMIYORUZ — yalnız service_role (sunucu API'si) yazabilir. Anon upload kapalı.

-- Mevcut kurulumlarda players tablosuna foto URL kolonu (şema.sql yeni
-- kurulumlarda zaten içeriyor).
alter table players add column if not exists avatar_url text;
