# Tahmin Ligi

Arkadaş grubu için Avrupa futbolu tahmin ligi. Fenerbahçe ve Galatasaray'ın
Şampiyonlar Ligi, Beşiktaş'ın Avrupa Ligi, Trabzonspor'un Konferans Ligi
maçları üzerine oynanır.

Herkes siteyi salt-okunur takip eder; tahminleri yönetici panelinden girer.
Maç sonuçları otomatik güncellenir, puan tablosu kendiliğinden hesaplanır.

## Kurallar

- Tahmin = maç sonucu (ev sahibi / beraberlik / değişen). Joker yok.
- Doğru sonuç = 1 puan (panelden değiştirilebilir; puanlar her istekte
  güncel kurala göre yeniden hesaplanır).
- **Tahminler maç başlayana kadar mühürlüdür**: kimin tahmin girdiği görünür,
  tahminin kendisi maç başlayınca açılır.
- Maç başladıktan sonra tahmin girilemez/değiştirilemez.
- Puan tablosunda takım bazlı doğru sayıları (FB/GS/BJK/TS) da izlenir.

## Mimari

| Katman | Teknoloji |
| --- | --- |
| Arayüz | [Gea](https://geajs.com/) (compiler-first reactive UI) + Vite |
| API | Vercel serverless functions (`api/league.js`, `api/admin.js`) |
| Veritabanı | Supabase (Postgres, free tier) — yalnız server-side erişim |
| Maç verisi | ESPN public scoreboard API (token gerekmez) |

Senkronizasyon cron/thread kullanmaz: `/api/league` isteği geldiğinde son
başarılı senkronizasyon 90 saniyeden eskiyse ESPN'den taze veri çekilip
veritabanına yazılır (lazy sync). Site arayüzü 60 sn'de bir (canlı maç varken
30 sn'de bir) sessizce yenilenir; maç geceleri veri bu sayede kendiliğinden
taze kalır. Yönetim panelinde ayrıca manuel senkron düğmesi vardır.

### Sağlamlık kuralları

- Maçlar `(provider, external_id)` anahtarıyla idempotent yazılır.
- Bitmiş bir maç asla geri alınmaz (gecikmiş sağlayıcı yanıtına karşı).
- ESPN kaynaklarından biri hata verirse mevcut maçlar silinmez; tüm kaynaklar
  sağlıklı döndüğünde takip dışı kayıtlar temizlenir.
- Türkçe karakter normalizasyonu + alias eşleştirmesiyle yalnız 4 takımın
  maçları izlenir; takım adları kanonik yazımla saklanır.

## Kurulum

```bash
npm install
```

### Supabase

1. [supabase.com](https://supabase.com) üzerinde ücretsiz bir proje oluştur.
2. SQL Editor'de `supabase/schema.sql` dosyasını çalıştır.
3. Project Settings → API üzerinden `Project URL` ve `service_role` anahtarını al.

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
npm run dev              # yalnız arayüz (API yok)
npm run build            # üretim derlemesi
```

Tam yığın yerel test için [Vercel CLI](https://vercel.com/docs/cli):

```bash
vercel env pull .env.local
vercel dev
```

### Duman testleri

```bash
node scripts/smoke-espn.mjs     # ESPN'den gerçek veri çeker
node scripts/smoke-league.mjs   # payload + puanlama + mühür mantığı
node scripts/smoke-sync.mjs     # upsert/anti-regression/prune mantığı
```

## Kullanım

- **Site**: tarih şeridinden gün seç, maç kartına dokun → alt sheet'te tahminler
  ve puanlar. "Tahminlerim" sekmesi için bir kez "Kimsin?" seçimi yapılır
  (cihazda saklanır) — kişisel karneni görürsün.
- **Yönetim** (`/admin`, footer'daki link): şifre ile giriş.
  - *Tahminler*: oyuncu seç, günlere gruplu maçlarda sonuç seç; kaydetme çubuğu
    yalnız değişen satırları gönderir. Kilitli maçlar gri.
  - *Oyuncular*: ekle / pasifleştir (pasif oyuncu listeden düşer, verisi kalır).
  - *Puanlama*: etiket, durum (geçici/kesin), doğru sonuç puanı.
  - *Veri*: senkronizasyon durumu + manuel senkron.

## API

| Yöntem | Yol | Açıklama |
| --- | --- | --- |
| `GET` | `/api/league` | Herkese açık lig verisi (lazy sync dahil) |
| `POST` | `/api/admin/login` | Şifre doğrulama |
| `GET` | `/api/admin/bootstrap` | Panel verisi (Bearer şifre) |
| `PUT` | `/api/admin/predictions` | Tahmin kaydet/sil (batch, atomic) |
| `POST` | `/api/admin/players` | Oyuncu ekle |
| `PATCH` | `/api/admin/players` | Oyuncu güncelle (ad/renk/aktif) |
| `PUT` | `/api/admin/scoring` | Puanlama kuralları |
| `POST` | `/api/admin/sync` | Manuel senkronizasyon |

Yönetim uçları `Authorization: Bearer <ADMIN_PASSWORD>` başlığı ister.
Cookie/session yoktur; şifre tarayıcı sekmesi kapatılınca unutulur.

## Proje yapısı

```text
api/            Vercel serverless fonksiyonları
lib/            Sunucu katmanı: espn, targets, sync, league, status, supabase
supabase/       Veritabanı şeması
scripts/        Duman testleri
src/
  stores/       league-store (veri+polling), ui-store, admin-store
  pages/        Maçlar, Puan Durumu, Tahminlerim, Geçmiş, Admin (+admin sekmeleri)
  components/   DateStrip, MatchRow, MatchSheet, StandingsTable, Podium, ...
```

## Faz 2 fikirleri

- Form/streak çipleri puan tablosunda
- İki oyuncu head-to-head karşılaştırma
- Haftalık özet paylaşım kartı
- Sezon arşivi
