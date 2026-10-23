# AGENTS.md — tahmin-ligi

Arkadaşlar arası futbol tahmin ligi (Fenerbahçe, Galatasaray, Beşiktaş,
Trabzonspor Avrupa maçları). Gea SPA + Vercel functions + Supabase + ESPN.

## Başlangıç protokolü

1. Bu dosyayı ve `README.md`'yi oku.
2. Aşağıdaki **Gea kısıtlarını** okumadan `src/` altında kod yazma.

## Komutlar

```powershell
npm run build                 # üretim derlemesi (src değişince MUTLAKA)
npm run dev                   # yalnız arayüz (HMR; API yok)
npm run dev:api               # in-memory demo API (DB gerektirmez, 8787)
npm run dev:db                # GERÇEK Supabase'li tam yığın (8787, .env gerekli)
npm run demo                  # build + in-memory demo sunucu
npm run check:db              # Supabase bağlantı/şema/senkron doğrulaması
node --env-file=.env scripts/e2e-local.mjs        # API uçtan uca (12 test)
node --env-file=.env scripts/browser-check.mjs    # headless tarayıcı UI turu
node scripts/smoke-espn.mjs                       # gerçek ESPN çekimi
node scripts/smoke-league.mjs                     # payload/puanlama (mock)
node scripts/smoke-sync.mjs                       # senkron mantığı (mock)
node scripts/tests/server.test.mjs                # sunucu katmanı testleri (offline)
```

Test protokolü: src değişikliğinde `npm run build` + `browser-check`; lib/api
değişikliğinde `smoke-*` + `scripts/tests` + (sunucu ayaktaysa) `e2e-local`.
Hiçbir şey "PASS" olarak raporlanmaz; komut çıktısı olmadan.

## Gea kısıtları (kanıtlanmış — vurulduk)

Sürüm: @geajs/core 1.5.1 + vite-plugin 1.5.0. Repro:
`D:\development\drive-trace\tmp\opencode\gea-repro`. Ayrıntılı mekanizma:
`docs/gea-upstream-bugs.md`.

1. **Keyed `.map()` callback parametresinin adı ASLA `d` olamaz** — derleyicinin
   iç disposer değişkenini gölgeler; `e.add is not a function` / sessiz boş
   liste üretir. Açıklayıcı adlar kullan (`group`, `match`, `chip`...).
2. **Component `.tsx` dosyaları yalnız `export default` içerir.** Yanında
   named export varsa modülün şablon derlemesi tamamen atlanır → sessiz boş
   render. Yardımcılar local function.
3. **Rota hedefleri class component olmalı.** `router.ts`'de function
   component sayfa → RouterView boş render eder.
4. **Erken `return null` yasak** (function component'lerde): store'a bağımlı
   şablonda null dönünce reaktif yeniden render hiç tetiklenmez. Yerine:
   class component + hep render edilen kök + CSS görünürlük sınıfı
   (`.open`/`.has` deseni; bkv. MatchSheet, IdentityModal, Podium).
5. **template() içinde `let` yeniden ataması yasak** (function ve class).
   Build hatası verir. İç içe ternary ile `const` hesapla.
6. **Keyed `.map()` öğesi component olmalı.** Ham element + dinamik
   class/attr → runtime `e.add is not a function`.
7. **Keyed listeler JSX içinde DOĞRUDAN store erişimiyle map'lenmeli**
   (`store.getter.map(...)`). Gövdede çok adımlı türetilmiş local diziyi
   map'lemek listeyi sessizce boşaltır. Türetmeyi store getter'ının içine
   taşı (bkv. league-store `resultsByDay`, admin-store `editorDays`).
8. Fonksiyon içinde JSX döndüren yardımcı fonksiyonlardan kaçın; koşulları
   JSX içinde iç içe ternary ile yaz. Fragment `.map()` kökü yok, dinamik
   component etiketi yok, `<option selected={...}>` yerine
   `<select value={...}>` kullan, `.map(([a,b]) => ...)` dizi
   destructuring'i yok (`entry[0]`/nesne dizisi kullan).

## Sözleşmeler

- **Secrets**: `.env` asla commit'e girmez, değeri asla yazdırılmaz/loglanmaz.
  Script'ler `--env-file=.env` ile çalışır. `SUPABASE_SERVICE_ROLE_KEY` yalnız
  server'da (api/) kullanılır; istemciye asla sızmaz.
- **UI dili Türkçe**; hata mesajları kullanıcı dostu olmalı.
- **Tahmin mührü**: kickoff geçene kadar tahmin sonucu API seviyesinde gizli
  (kimin tahmin girdiği görünür). Bu kural UI'a değil API'ye ait.
- **Senkron**: cron yok; `/api/league` bayat veriyi görünce ESPN'den çeker.
  Bitmiş maç geri alınmaz; kaynak hatasında eski veri korunur.
- **Gea skill'leri** `.agents/skills/` altında; yeni Gea kodu yazmadan
  `gea-framework` skill'ini oku.
- Commit öncesi: build + ilgili testler; commit mesajları kısa Türkçe.

## Bilinen açık noktalar

- `docs/gea-upstream-bugs.md`: upstream'e bildirilecek derleyici bug'ları ve
  minimal repro talimatı.
- Sezon geçişinde eski sezon maçları prune edilir (arşiv faz 2).
- Supabase free tier 1 hafta hareketsizlikte duraklar; ilk istek canlandırır.
