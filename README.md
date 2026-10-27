# Tahmin Ligi

Arkadaş grubu için futbol tahmin ligi. İki ayrı lig üzerinde oynanır:

- **Avrupa (EU)** — Fenerbahçe ve Galatasaray'ın Şampiyonlar Ligi,
  Beşiktaş'ın Avrupa Ligi, Trabzonspor'un Konferans Ligi maçları.
- **Süper Lig (TSL)** — TÜM Süper Lig fikstürü (yalnız 4 büyük takım değil).

Herkes siteyi takip eder **ve kendi tahminini girer** — yönetici paneli yoktur (#24).
Tahmin girişi maç akordiyonundadır: güne tıkla → maça tıkla → oyuncular Ev/Beraberlik/
Deplasman seçenekleriyle listelenir → seçimleri yap → Kaydet. Maç sonuçları otomatik
güncellenir, puan tablosu kendiliğinden hesaplanır. Oyuncular iki ligde ortaktır;
puan tabloları ve fikstürler lig bazlıdır.

> Güvenlik notu: tahmin/oyuncu uçları şifresizdir; siteye erişim Vercel
> Deployment Protection ile sınırlıdır. Korumayı kaldırırsan linki olan herkes
> tahmin yazabilir.

## Kurallar

- Tahmin = maç sonucu (ev sahibi / beraberlik / değişen). Joker yok.
- Doğru sonuç = 1 puan (puanlar her istekte güncel kurala göre yeniden
  hesaplanır; kural tek ve sabittir, lig bazlı değildir). Bonus puan yoktur.
- **Tahminler maç başlayana kadar mühürlüdür**: kimin tahmin girdiği görünür
  ("girdi" rozeti), tahminin kendisi maç başlayınca açılır.
- Maç başladıktan sonra tahmin girilemez/değiştirilemez (API 409 ile reddeder).
- Akordiyonda herkes her oyuncu adına giriş yapabilir (tek telefondan toplu
  giriş için); kickoff öncesi yapılan yeni kayıt eski tahminin ÜZERİNE yazar.
- Yeni oyuncu akordiyondaki "+ Oyuncu" ile eklenir; avatar oyuncu detay
  ekranından yüklenir.
- Puan tablosunda takım bazlı doğru sayıları (FB/GS/BJK/TS) da izlenir
  (Avrupa ligi görünümünde; Süper Lig görünümünde isabet yüzdesi vardır).

## Mimari

| Katman | Teknoloji |
| --- | --- |
| Arayüz | [Gea](https://geajs.com/) (compiler-first reactive UI) + Vite |
| API | Vercel serverless functions (`api/league.js`, `api/predictions.js`, `api/players.js`) |
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
sunucu ETag/If-None-Match ile gövdesiz **304** yanıtı döner. (#24 ile manuel
senkron düğmesi kaldırıldı — lazy senkron + bayatlık bandı yeterlidir.)

### Discord gece özeti (#29)

Her gece **00:20 TR** (21:20 UTC)'de Vercel cron (`vercel.json → crons`)
`GET /api/notify` ucunu `Authorization: Bearer CRON_SECRET` ile çağırır. Uç
önce senkronu tazeler (site hiç açılmasa bile final skorlar DB'ye düşer),
sonra **bitmiş + en az 1 (aktif) tahminli + henüz gönderilmemiş** maçları tek
**sade düz metin** özetinde Discord webhook'una gönderir: skor + oyuncu
başına ✅/❌ ve puan, altta güncel lig puan durumu. Aynı maç ikinci kez
gönderilemez: `match_notifications` tablosu maç başına tek seferlik flag
tutar (migration, geçmiş bitmiş maçları da "gönderilmiş" olarak tohumlar).
Discord gönderimi başarısızsa flag yazılmaz → ertesi gece otomatik yeniden
denenir. Tahminli biten maç yoksa mesaj gitmez; tahminsiz biten maçlar
sessizce flag'lenir. İki lig aynı özette toplanır; UEFA kupaları kısa
etiket taşır (ŞL/AL/KL). Güvenlik: oyuncu adları sanitize edilir ve
`allowed_mentions` tamamen kapalıdır (`@everyone` enjeksiyonu imkânsız).
Ortam değişkenleri (yalnız sunucu): `DISCORD_WEBHOOK_URL`, `CRON_SECRET`
(tanımsızsa üretim ucu 503 ile kapalıdır). Önizleme: `npm run notify:dry`
(gerçek DB'den göndermeden; `--send` ile gönderir).

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
(`matches.competition` check constraint'inin `'TSL'` içerecek biçimde
yeniden kurulması + eski `bonus:<yıl>` anahtarlarının `bonus:EU:<yıl>`
kopyası). `league`/`season_year` kolonları zaten #18'in
`2026-10-season-league.sql` migration'ındadır — #18'i atlamış bir veritabanında
önce o, sonra `2026-11` çalıştırılır.
Kod önce deploy edilirse TSL senkron upsert'leri eski constraint'e takılır;
SQL önce işlenirse mevcut Avrupa verisi etkilenmez (varsayılan lig `EU`).

**Migration deploy sırası (#29):** Discord gece özeti kodu canlıya çıkmadan
ÖNCE `supabase/migrations/2026-11-match-notifications.sql` çalıştırılmalıdır
(tablo + geçmiş bitmiş maçların tohum flag'i — ilk cron turu tüm sezonu
dökmesin). Kod önce deploy edilirse uç zararsız biçimde hata verip mesaj
göndermez; migration sonrası kendi kendine düzelir.

### Vercel

1. Projeyi Vercel'e bağla (Vite otomatik algılanır).
2. Environment variables:

| Değişken | Açıklama |
| --- | --- |
| `SUPABASE_URL` | Supabase proje URL'i |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role anahtarı (yalnız server'da) |
| `DISCORD_WEBHOOK_URL` | (#29) gece özeti webhook URL'i — yalnız server; tanımsızsa uç dry-run'a düşer |
| `CRON_SECRET` | (#29) cron isteğini imzalar; tanımsızsa `/api/notify` üretimde 503 ile kapalıdır |

Bu ilk ikisi zorunludur. `SYNC_STALE_SECONDS` (90) ve `LEAGUE_NAME` ("Tahmin Ligi")
env'e girilmezse kod içindeki varsayılanlarla çalışır. (#24 ile `ADMIN_PASSWORD`
kaldırıldı — eski dağıtımlarda env'de kalması zararsızdır, okunmaz.)

3. Deploy. İlk ziyarette fikstür otomatik çekilir.

### Yerel geliştirme

```bash
npm run build             # üretim derlemesi (src değişince mutlaka)
npm run dev               # yalnız arayüz (HMR; API için dev:api gerekir)
npm run dev:api           # in-memory demo API — DB gerekmez, tahmin girişi açık
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
node --env-file=.env scripts/e2e-local.mjs      # API uçtan uca (oyuncu ekle/mühür/kilit/benzersizlik)
node scripts/browser-check.mjs                   # headless Chromium UI turu (akordiyon tahmin girişi dahil; yalnız localhost)
node scripts/tests/server.test.mjs               # sunucu katmanı (offline; espn/payload/predictions/players/sync)
node scripts/smoke-espn.mjs                      # gerçek ESPN çekimi (30 maç beklenir)
node scripts/smoke-league.mjs                    # payload + puanlama + mühür (mock)
node scripts/smoke-sync.mjs                      # upsert/anti-regression/prune (mock)
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
- **Tahmin girişi (#24)**: maç kartına dokun → akordiyon açılır → oyuncular
  Ev/Beraberlik/Deplasman seçenekleriyle listelenir (kim girdiyse "girdi"
  rozetidir; kickoff'a kadar tahminin kendisi gizli kalır). Seçimleri yap,
  **Kaydet** — yalnız dokunulan satırlar gider. Başlamış maçta akordiyon
  açılan tahminleri ve puanları gösterir. Akordiyondaki **"+ Oyuncu"** ile
  yeni oyuncu eklenir (isim + renk). Avatar, oyuncu detay ekranındaki
  "Fotoğraf yükle/değiştir" ile yüklenir (kırpma dahil).

## API

Tüm uçlar herkese açıktır (#24); ek koruma yoktur — erişim Vercel Deployment
Protection ile sınırlıdır.

| Yöntem | Yol | Açıklama |
| --- | --- | --- |
| `GET` | `/api/league?league=EU\|TSL` | Herkese açık lig verisi (lazy sync dahil; lig varsayılanı EU) |
| `PUT` | `/api/predictions` | Tahmin kaydet/sil (batch, atomic; başlamış maçta 409) |
| `POST` | `/api/players` | Oyuncu ekle (isim 2-40, küçük-harf benzersizlik, renk) |
| `PATCH` | `/api/players` | Oyuncu güncelle (ad/renk/aktif) |
| `DELETE` | `/api/players` | Oyuncu sil (tahmini yoksa) |
| `POST` | `/api/players/avatar` | Avatar yükle (kırpılmış görsel, Storage'a) |
| `DELETE` | `/api/players/avatar` | Avatar kaldır |

`PUT /api/predictions` gövdesi: `{playerId, items:[{matchId, outcome}]}` —
`outcome: ''` tahmini siler; batch atomic'tir (bir kilitli maç tüm grubu reddettirir).

## Proje yapısı

```text
api/            Vercel serverless fonksiyonları
infra/runner/   Yerel self-hosted Docker runner (tahmin-ligi-docker-1)
lib/            Sunucu katmanı: espn, targets, sync, league, status, supabase
public/logos/   Lig zemin logoları (eu.svg, tsl.svg — aynı adla değiştirilebilir)
supabase/       Veritabanı şeması + migrations
scripts/        Duman testleri
src/
  stores/       league-store (veri+polling), ui-store, predictions-store, avatar-store
  pages/        Maçlar, Puan Durumu, Tahminlerim, Geçmiş
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

Ne zaman alınmalı: büyük değişikliklerden önce ve büyük maç haftalarının
sonunda. `app_config` tablosundaki `last_backup` damgasını
`backup-db.mjs` yazar (#24 sonrası panelde gösterimi yoktur; yedek CLI işidir).

## Faz 2 fikirleri

- Form/streak çipleri puan tablosunda
- İki oyuncu head-to-head karşılaştırma
- Haftalık özet paylaşım kartı
- Sezon arşivi
