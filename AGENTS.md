<!-- zima:workspace-context v2 -->

# Workspace context (maintained by zima — do not edit per-repo)

This repository is a member of the **zima** workspace. All links below are relative
to this repository's root at `zima/projects/tahmin-ligi/`.
Workspace router: `../../AGENTS.md`.
Card: `../../repos/tahmin-ligi.md`.

Rules that apply regardless of repo-local rules (never-loosened set):

- **Chain of command** (2026-10-16): subagents never contact the user directly — Telegram
  included. Report to the leader; the leader asks the user.
- **Telegram is outbound-only**: only the leader sends notifications using
  `../../scripts/telegram-notify.mjs`. No listener, MCP server or replies.
  Schema: `../../docs/telegram/NOTIFICATIONS.md`.
- **Temp files**: `.agent-tmp/<task>/` inside this repo; never AppData; never committed;
  cleaned task-scoped. PARKED decision files live in zima's `.local-state/parked/` (durable).
- **Issues**: this repo's issues follow `../../docs/issues.md` — legacy (marker-less) issues
  are READ-ONLY; commit messages use `Refs #N` (never auto-close keywords); `Closes #N`
  lives in the PR body only; gh writes are leader-only.
- **Runners**: labels are routing; never stop another repo's runner or quit Docker
  Desktop; see `../../docs/runners.md`.
- **Workspace credentials**: Telegram bot token/chat ID come from ignored root
  `../../.env`; never print or commit them. Other credentials keep their existing storage.
  Existing product
  signing material and explicitly approved private product artifacts follow repo-local
  protection rules; this block never authorizes reading, publishing or committing them.
- **Git boundaries**: this repo is an independent git root; never treat the workspace as
  one repo.
- **Review**: workspace risk-based T0–T3 minimums apply; keep stricter local acceptance
  gates. Mandatory policy conflicts are patched at their actual source before cutover.

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
9. **Map callback'leri template-body `const`'larına kapanmaz** — liste
   binding'i reaktif güncellemede eski (stal) kapanışla yeniden değerlenir;
   `identity.id` gibi ifadeler null'da patlar. Callback içinde yalnızca
   doğrudan STORE erişimi kullan (`uiStore.identityId`), hesaplamayı item
   component'in kendi prop'larına taşı (bkv. PredictionCard).
10. **Prop'a bağlı JSX element-koşulları ve URL attr binding'leri güvenilmez**
    (bkv. upstream madde 9): koşul/attr ertelenmiş değerlendirmede yanlış
    dönebilir; statik src binding'i bile imperatif atamayı sonradan
    ezebilir. Görsel yükler için pattern: `<img>` YOK — URL'i render anında
    prop'tan oku, onAfterRender'da imperatif CSS `background-image` ata
    (bkv. Crest).
11. **Route sayfasında view anahtarı body `const`'una yazılmaz** (vurulduk,
    #20 U8): `const det = store.x` + `if (det !== '')` kalıbı reaktif
    güncellemede BAYAT kapanışla değerlenir → görünüm hiç değişmez (tıklama
    çalışır, store yazılır, sayfa tepki vermez). Doğrusu: koşulu JSX İÇİNDE
    doğrudan store okumasıyla çevir (`{store.x === '' ? <A/> : <B/>}`) ve
    detay içeriğini `playerId={store.x}` binding prop'u alan child
    component'e taşı (bkv. PlayersPage + PlayerDetail).
12. **`template()` kökünde ternary YASAK** (vurulduk, #20 U4): `return cond ?
    <A/> : <B/>` sessizce boş yorum düğümleri üretir (`<!--0-->`, hata yok).
    Tek kök div + içerde koşullu içerik (bkv. EditorRow akordiyon).
13. **Function default export'lu `.tsx` dosyasında local JSX class olmaz**
    (vurulduk, #21): default export function component ise ve aynı dosyada
    template()'li local class varsa default component sessizce boş render
    eder + class prop'larında TypeError. Default export'u class yap
    (bkv. AccuracyTable; upstream madde 10).

## Sözleşmeler

- **Secrets**: `.env` asla commit'e girmez, değeri asla yazdırılmaz/loglanmaz.
  Script'ler `--env-file=.env` ile çalışır. `SUPABASE_SERVICE_ROLE_KEY` yalnız
  server'da (api/) kullanılır; istemciye asla sızmaz.
- **UI dili Türkçe**; hata mesajları kullanıcı dostu olmalı.
- **Tahmin mührü**: kickoff geçene kadar tahmin sonucu API seviyesinde gizli
  (kimin tahmin girdiği görünür). Bu kural UI'a değil API'ye ait.
- **Senkron**: cron yok; `/api/league` bayat veriyi görünce ESPN'den çeker.
  Bitmiş maç geri alınmaz; kaynak hatasında eski veri korunur.
- **Yeni lig**: `lib/targets.js` içindeki `LEAGUES` kayıt defterine kayıt
  eklenerek açılır; ESPN kaynak slug'ları `lib/espn.js` `LEAGUE_SOURCES`'ta
  tanımlanır (lig kodu → slug/turnuva eşlemesi). Kayıt defteri sunucu
  tarafını açar; istemcide DE `leagueStore`/`adminStore` `switchLeague`
  bekçileri ve `AccuracyTable` kolonları elle güncellenmelidir (iki lig
  'EU'|'TSL' sabitidir — üçüncü lig src işi gerektirir).
- **Gea skill'leri** `.agents/skills/` altında; yeni Gea kodu yazmadan
  `gea-framework` skill'ini oku.
- **CI ve Runner**: Tüm CI koşuları (`ci.yml`) GitHub-hosted yerine yerel self-hosted Docker runner (`tahmin-ligi-docker-1`, label `[self-hosted, linux, x64, docker, tahmin-ligi]`, `infra/runner/compose.yml`, başlatma `scripts/start-ci-runner.ps1`) üzerinde çalışır. GitHub-hosted runner kullanımı yasaktır.
- Commit öncesi: build + ilgili testler; commit mesajları kısa Türkçe.

## Bilinen açık noktalar

- `docs/gea-upstream-bugs.md`: upstream'e bildirilecek derleyici bug'ları ve
  minimal repro talimatı.
- Sezon geçişinde eski sezon maçları prune edilir (arşiv faz 2).
- Supabase free tier 1 hafta hareketsizlikte duraklar; ilk istek canlandırır.
