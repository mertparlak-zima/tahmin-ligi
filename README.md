# Tahmin Ligi

Arkadaş grubu için futbol tahmin ligi. İki ayrı lig üzerinde oynanır:

- **Avrupa (EU)** — Fenerbahçe ve Galatasaray'ın Şampiyonlar Ligi,
  Beşiktaş'ın Avrupa Ligi, Trabzonspor'un Konferans Ligi maçları.
- **Süper Lig (TSL)** — TÜM Süper Lig fikstürü (yalnız 4 büyük takım değil).

Herkes siteyi salt-okunur takip eder; tahminleri yönetici panelinden girer.
Maç sonuçları otomatik güncellenir, puan tablosu kendiliğinden hesaplanır.
Oyuncular iki ligde ortaktır; puan tabloları ve fikstürler lig bazlıdır.

## Kurallar

- Tahmin = maç sonucu (ev sahibi / beraberlik / değişen). Joker yok.
- Doğru sonuç = 1 puan (panelden değiştirilebilir; puanlar her istekte
  güncel kurala göre yeniden hesaplanır).
- **Puanlama kuralı iki lig için de ortaktır** (tek `scoring` yapılandırması);
  lig bazlı olan yalnızca sezonluk bonuslardır (`bonus:<lig>:<sezon>` anahtarı,
  örn. `bonus:TSL:2026`).
- **Tahminler maç başlayana kadar mühürlüdür**: kimin tahmin girdiği görünür,
  tahminin kendisi maç başlayınca açılır.
- Maç başladıktan sonra tahmin girilemez/değiştirilemez.
- Puan tablosunda takım bazlı doğru sayıları (FB/GS/BJK/TS) da izlenir
  (Avrupa ligi görünümünde; Süper Lig görünümünde isabet yüzdesi vardır).

## Mimari

| Katman | Teknoloji |
| --- | --- |
| Arayüz | [Gea](https://geajs.com/) (compiler-first reactive UI) + Vite |
| API | Vercel serverless functions (`api/league.js`, `api/admin.js`) |
| Veritabanı | Supabase (Postgres, free tier) — yalnız server-side erişim |
| Maç verisi | ESPN public scoreboard API (token gerekmez) |

Senkronizasyon cron/thread kullanmaz: `/api/league` isteği geldiğinde son
başarılı senkronizasyon 90 saniyeden eskiyse ESPN'den taze veri çekilip
veritabanına yazılır (lazy sync). Senkron işi **iki ligi paralel** çalıştırır
(Avrupa kupaları + Süper Lig); manuel senkron yanıtı toplam alanların yanında
lig bazlı `leagues` detay dizisini de taşır. Paralel ziyaretçiler aynı bayat
pencerede tek denemeyi paylaşır: son deneme (`last_attempt_at`) 30 saniyeden
yeniyse tekrar ESPN çekimi yapılmaz (stampede koruması). Site arayüzü **120 sn'de
bir** (canlı maç varken 30 sn'de bir; gece 01–08 arası maç yokken 5 dk'da bir)
sessizce yenilenir; maç geceleri veri bu sayede kendiliğinden taze kalır.
Dönüş ziyaretlerde ilk ekran `sessionStorage` önbelleğinden **anında** gelir
ve arka planda tazelenir (stale-while-revalidate); içerik değişmediğinde
sunucu ETag/If-None-Match ile gövdesiz **304** yanıtı döner. Yönetim panelinde
ayrıca manuel senkron düğmesi vardır.

### Sağlamlık kuralları

- Maçlar `(provider, external_id)` anahtarıyla idempotent yazılır.
- Bitmiş bir maç asla geri alınmaz (gecikmiş sağlayıcı yanıtına karşı).
- ESPN kaynaklarından biri hata verirse mevcut maçlar silinmez; tüm kaynaklar
  sağlıklı döndüğünde takip dışı kayıtlar temizlenir.
- Türkçe karakter normalizasyonu + alias eşleştirmesiyle Avrupa liginde yalnız
  4 takımın maçları izlenir; Süper Lig liginde tüm fikstür izlenir (takım
  filtresi yoktur). Takım adları kanonik yazımla saklanır.

## Kurulum

```bash
npm install
```

### Supabase

1. [supabase.com](https://supabase.com) üzerinde ücretsiz bir proje oluştur.
2. SQL Editor'de `supabase/schema.sql` dosyasını çalıştır.
3. Project Settings → API üzerinden `Project URL` ve `service_role` anahtarını al.

**Migration deploy sırası (#21):** çoklu lig kodu CANLIYA çıkmadan ÖNCE SQL
Editor'da `supabase/migrations/2026-11-super-lig.sql` çalıştırılmalıdır
(`matches` tablosuna `league` kolonu + eski check constraint'in kaldırılması).
Kod önce deploy edilirse TSL senkron upsert'leri eski constraint'e takılır;
SQL önce işlenirse mevcut Avrupa verisi etkilenmez (varsayılan lig `EU`).

### Vercel

1. Projeyi Vercel'e bağla (Vite otomatik algılanır).
2. Environment variables:

| Değişken | Açıklama |
| --- | --- |
| `SUPABASE_URL` | Supabase proje URL'i |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role anahtarı (yalnız server'da) |
| `ADMIN_PASSWORD` | Yönetim paneli şifresi (güçlü seç) |

Bu üçü zorunludur. `SYNC_STALE_SECONDS` (90) ve `LEAGUE_NAME` ("Tahmin Ligi")
env'e girilmezse kod içindeki varsayılanlarla çalışır.

3. Deploy. İlk ziyarette fikstür otomatik çekilir.

### Yerel geliştirme

```bash
npm run build             # üretim derlemesi (src değişince mutlaka)
npm run dev               # yalnız arayüz (HMR; API için dev:api gerekir)
npm run dev:api           # in-memory demo API — DB gerekmez, şifre: demo123
npm run dev:db            # GERÇEK Supabase'li tam yığın (8787; .env gerekli)
npm run demo              # build + in-memory demo sunucu
npm run check:db          # Supabase bağlantı/şema/senkron doğrulaması
```

**Key'siz geliştirme (#7):** `SUPABASE_SERVICE_ROLE_KEY` olmadan
`SUPABASE_ANON_KEY` ile `npm run dev:db` çalıştırabilirsin — salt-okunur
(RLS korur; yazma uçları 503 döner). Demo verisi gerekmiyorsa
`npm run dev:api` (in-memory) hiç key istemez.

### Testler

```bash
node --env-file=.env scripts/e2e-local.mjs      # API uçtan uca (giriş/mühür/kilit/benzersizlik)
node --env-file=.env scripts/browser-check.mjs  # headless Chromium UI turu (sayfalar, sheet, admin)
node scripts/tests/server.test.mjs              # sunucu katmanı (offline; espn/payload/admin/sync)
node scripts/smoke-espn.mjs                     # gerçek ESPN çekimi (30 maç beklenir)
node scripts/smoke-league.mjs                   # payload + puanlama + mühür (mock)
node scripts/smoke-sync.mjs                     # upsert/anti-regression/prune (mock)
```

Agent kuralları ve öğrenilen Gea kısıtları için `AGENTS.md`; upstream'e
bildirilecek framework bug'ları için `docs/gea-upstream-bugs.md`.

## Kullanım

- **Site**: topbardaki lig değiştiriciyle **Avrupa ↔ Süper Lig** geçişi yapılır
  (tercih cihazda saklanır; tema, logolar ve sütunlar lige göre değişir).
  Tarih şeridinden gün seç, maç kartına dokun → alt sheet'te tahminler,
  puanlar ve takım form çipleri. "Tahminlerim" sekmesi için bir kez "Kimsin?"
  seçimi yapılır (cihazda saklanır) — kişisel karneni görürsün.
- **Puan Durumu**: lig puan tablosunun üstünde **Haftanın Tahmincisi** bandı
  (son biten ISO haftasında en çok doğru tahmin yapan oyuncu); "İsabet
  Şampiyonası" segmenti iki ligin isabet yüzdelerini birleşik tabloda gösterir
  (EU % · TSL % · Genel %, sıralama genel isabetle).
- **Temalar/logolar**: her lig kendi zemin logosunu kullanır
  (`public/logos/eu.svg`, `public/logos/tsl.svg`); gerçek logoyla aynı adla
  dosyayı değiştirmek yeterlidir.
- **Yönetim** (`/admin`): topbar'daki kilit düğmesinden (oturum açıksa "Panel")
  veya footer'daki linkten; şifre ile giriş.
  - *Lig seçici*: panel tüm sekmelerde Avrupa ↔ Süper Lig arasında geçer;
    editör/fikstür o ligin maçlarına iner, taslaklar sıfırlanır.
  - *Tahminler*: oyuncu seç, günlere gruplu maçlarda sonuç seç; kaydetme çubuğu
    yalnız değişen satırları gönderir. Kilitli maçlar gri. Oyuncu filtresi
    aktifken **hızlı giriş** düğmeleri boş tahminlere tek tıkla Ev sahibi /
    Beraberlik / Deplasman basar (sonradan tek tek düzenlenebilir).
  - *Oyuncular*: ekle / pasifleştir (pasif oyuncu listeden düşer, verisi kalır).
  - *Puanlama*: etiket, durum (geçici/kesin), doğru sonuç puanı — kural iki
    lig için de ortaktır, yalnız veritabanından yönetilir.
  - *Veri*: senkronizasyon durumu + manuel senkron; yanıt lig bazlı satırlarla
    (Avrupa/Süper Lig ayrı ayrı) listelenir.

## API

| Yöntem | Yol | Açıklama |
| --- | --- | --- |
| `GET` | `/api/league?league=EU\|TSL` | Herkese açık lig verisi (lazy sync dahil; lig varsayılanı EU) |
| `POST` | `/api/admin/login` | Şifre doğrulama |
| `GET` | `/api/admin/bootstrap?league=` | Panel verisi (Bearer şifre; lig kapsamı) |
| `PUT` | `/api/admin/predictions` | Tahmin kaydet/sil (batch, atomic) |
| `POST` | `/api/admin/players` | Oyuncu ekle |
| `PATCH` | `/api/admin/players` | Oyuncu güncelle (ad/renk/aktif) |
| `DELETE` | `/api/admin/players` | Oyuncu sil (tahmini yoksa; #6 test temizliği) |
| `POST` | `/api/admin/sync` | Manuel senkronizasyon (iki lig paralel; yanıtta `leagues` detayı) |

Yönetim uçları `Authorization: Bearer <ADMIN_PASSWORD>` başlığı ister.
Cookie/session yoktur; şifre tarayıcı sekmesi kapatılınca unutulur.

## Proje yapısı

```text
api/            Vercel serverless fonksiyonları
infra/runner/   Yerel self-hosted Docker runner (tahmin-ligi-docker-1)
lib/            Sunucu katmanı: espn, targets, sync, league, status, supabase
public/logos/   Lig zemin logoları (eu.svg, tsl.svg — aynı adla değiştirilebilir)
supabase/       Veritabanı şeması + migrations
scripts/        Duman testleri
src/
  stores/       league-store (veri+polling), ui-store, admin-store
  pages/        Maçlar, Puan Durumu, Tahminlerim, Geçmiş, Admin (+admin sekmeleri)
  components/   DateStrip, MatchRow, MatchSheet, StandingsTable, Podium, ...
```

## Üretim notları

- Supabase free tier ~1 hafta hareketsizlikte projeyi duraklatır; ilk istek
  yeniden canlandırır (ilk açılış birkaç saniye sürebilir).
- `/api/league` bayat veri görünce senkronize olduğu için soğuk başlangıç +
  senkron bir arada 3-8 sn sürebilir; arayüz iskelet gösterir.
- Sezon geçişinde (Temmuz) önceki sezon maçları temizlenir; arşiv faz 2.

### Yedekleme

Tahminler elle girilen veridir; ESPN'den veya başka bir kaynaktan yeniden
üretilemez. Supabase free tier otomatik yedek vermediği için düzenli yerel
yedek alınır:

```bash
node --env-file=.env scripts/backup-db.mjs                                        # yedek al
node --env-file=.env scripts/restore-predictions.mjs backups/<dosya>.json --dry   # ne yazılacağını gör
node --env-file=.env scripts/restore-predictions.mjs backups/<dosya>.json         # geri yükle
```

Yedek dosyaları `backups/` altına tarih damgalı JSON olarak yazılır ve
`.gitignore` kapsamındadır (commit'e girmez). İçerik: oyuncular (tüm sütunlar),
tahminler (tüm sütunlar) ve `app_config` satırları (puanlama kuralı, sezonluk
bonuslar). Geri yükleme idempotent upsert'tir; hiçbir satır silinmez, tahminin
geri gelmesi için bağlı maçın DB'de mevcut olması yeterlidir.

Ne zaman alınmalı: `#18` implementasyon adımlarından önce ve büyük maç
haftalarının sonunda. Yönetim panelindeki "son yedek" damgası
`app_config` tablosundaki `last_backup` anahtarından okunur; bu damgayı
`backup-db.mjs` yazar.

## Faz 2 fikirleri

- Form/streak çipleri puan tablosunda
- İki oyuncu head-to-head karşılaştırma
- Haftalık özet paylaşım kartı
- Sezon arşivi
