// Discord gece özeti (#29): bitmiş + en az 1 tahminli + henüz gönderilmemiş
// maçları TEK sade düz metin mesajında gönderir. Embed/logo yok (kullanıcı
// tercihi — plan modu kararı). Tetik yalnız Vercel cron: günde 1 kez 00:20 TR
// (vercel.json crons → api/notify.js). Cron/thread yok.
//
// Tekrar engeli: match_notifications tablosu maç başına tek seferlik flag
// tutar (PK match_id). Discord gönderimi başarısızsa flag YAZILMAZ → ertesi
// gece otomatik yeniden denenir. Tahminli biten maç yoksa mesaj gitmez;
// tahminsiz biten maçlar sessizce flag'lenir (sonradan tahmin girilemez).
//
// Biçim (#33 — lig başına bölümlü; kullanıcı onaylı örnek):
//   🏟 Tahmin Ligi · Süper Lig · 27 Eki Pzt
//
//   Galatasaray 2-0 Samsunspor
//   ✅ Ogün
//   ❌ Mert
//
//   🏟 Tahmin Ligi · Avrupa · 27 Eki Pzt
//
//   Beşiktaş 1-1 Lyon (ŞL)
//   ✅ Ece
//
//   📊 Süper Lig Puan Durumu
//   ```
//   #  Oyuncu  Puan
//   ---------------
//   1  Ogün       3
//   2  Ece        2
//   3  Mert       1
//   ```
//
//   🔗 [tahmin-ligi-one.vercel.app](https://tahmin-ligi-one.vercel.app)
//
// Discord markdown tablo render ETMEZ (doğrulandı: Ekim 2026) — puan
// durumunun tek düz metin çözümü monospace kod bloğu (bkv. standingsTable).
// Webhook mesajlarında masked link tıklanabilir çıkar (kullanıcı mesajlarında
// çıkmaz). Bölüm başlığı lig bölümünün İLK maç bloğuna yapışık taşınır:
// packChunks mesajı bölecek olsa başlık bloğundan kopmaz.

import { FINISHED_STATUSES } from './status.js'
import { outcomeOf } from './league.js'
import { LEAGUE_BY_CODE } from './targets.js'

// Discord içerik sınırı 2000; güvenlik payı.
const MAX_CONTENT = 1900

// Kısa turnuva etiketleri: TSL etiketsiz (öntanımlı), UEFA kupaları etiketli —
// iki lig aynı özetteyken Avrupa maçı karışmasın.
const COMP_TAGS = { CL: 'ŞL', EL: 'AL', UECL: 'KL' }

// #33: özet altındaki site linki — kod içi varsayılan, SITE_URL env'i örer.
const DEFAULT_SITE_URL = 'https://tahmin-ligi-one.vercel.app'
// Kod bloğu tablosunda isim sütunu üst sınırı: mobil Discord'da uzun satır
// satırbaşına sarılıp hizayı bozar (araştırma notu, Ekim 2026).
const MAX_NAME_COL = 24

const tzOpts = { timeZone: 'Europe/Istanbul' }
const dayMonthFmt = new Intl.DateTimeFormat('tr-TR', { ...tzOpts, day: 'numeric', month: 'short' })
const weekdayFmt = new Intl.DateTimeFormat('tr-TR', { ...tzOpts, weekday: 'short' })

/**
 * Oyuncu adını Discord'a güvenli yaz: mention/markdown enjeksiyonunu kırar
 * (adlar herkese açık POST /api/players ile girilebilir — "@everyone" veya
 * kalın spam yazılamaz). allowed_mentions ayrıca payload'da kapatılır.
 */
export function sanitizeName(name) {
  const clean = String(name ?? '')
    // URL şemaları/www önekleri düşer: isim alanı herkese açık olduğundan
    // "https://phish.example" adı Discord'da tıklanabilir çıkmasın (T2 #34).
    .replace(/(https?:\/\/|www\.)/gi, '')
    .replace(/[*_`~|>@#[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
  return clean || '?'
}

/** Özet başlığındaki tarih etiketi: tek gün "27 Eki Pzt", aralık "27 Eki – 2 Kas". */
export function dateLabel(kickoffs) {
  const days = []
  for (const kickoff of kickoffs) {
    const label = dayMonthFmt.format(new Date(kickoff))
    if (!days.some(d => d.label === label)) days.push({ label, kickoff })
  }
  if (days.length === 0) return ''
  if (days.length === 1) return `${days[0].label} ${weekdayFmt.format(new Date(days[0].kickoff))}`
  return `${days[0].label} – ${days[days.length - 1].label}`
}

/**
 * Puan durumunu hizalı monospace tablo olarak üretir (#33). Discord markdown
 * tablo render etmediğinden (doğrulandı: Ekim 2026) kod bloğu tek düz metin
 * çözümüdür: sütunlar boşlukla hizalanır, Discord bloğu monospace gösterir.
 * Blok içinde emoji YOK (çift genişlilik hizayı bozar), ayraç ASCII '-'
 * (font-güvenli), isimler MAX_NAME_COL'de kırpılır (mobilde satır sarması).
 * sanitizeName backtick temizlediğinden oyuncu adı fence'i kıramaz.
 */
export function standingsTable(rows) {
  if (!rows || rows.length === 0) return ''
  // Tablo sütununu dar (tek hücre genişlikli) karakterlere indir: emoji/CJK
  // gibi geniş karakterler monospace hizayı bozar (T2 #34). Yalnız tabloyu
  // etkiler — maç satırlarındaki isimler bütündür. Daraltma boş isim
  // bırakırsa '?' düşer (satır kaybolmaz).
  const narrow = s => s.replace(/[^\p{L}\p{N}\p{P}\p{Zs}'’&+%-]/ug, '') || '?'
  const names = rows.map(r => {
    const trimmed = narrow(r.name)
    return trimmed.length > MAX_NAME_COL ? `${trimmed.slice(0, MAX_NAME_COL - 1)}…` : trimmed
  })
  const rankW = String(rows.length).length
  const nameW = Math.max('Oyuncu'.length, ...names.map(n => n.length))
  const ptsW = Math.max('Puan'.length, ...rows.map(r => String(r.points).length))
  const line = (rank, name, pts) => `${rank.padEnd(rankW)}  ${name.padEnd(nameW)}  ${pts.padStart(ptsW)}`
  const head = line('#', 'Oyuncu', 'Puan')
  const sep = '-'.repeat(rankW + nameW + ptsW + 4)
  const body = rows.map((r, i) => line(String(i + 1), names[i], String(r.points)))
  return `\`\`\`\n${[head, sep, ...body].join('\n')}\n\`\`\``
}

/**
 * Özet parçalarını üretir (saf — test edilir).
 * pending: gönderilecek bitmiş maç satırları; allFinished: puan durumu için
 * (lig, sezon)'in TÜM bitmiş maçları; predictions: {player_id, match_id, outcome};
 * siteUrl: özet altındaki masked link (öntanımlı DEFAULT_SITE_URL).
 * Dönen parçalar packChunks ile mesajlara paketlenir; tablo/başlık içeren her
 * parça kendi içinde bütündür → mesaj bölünmesinde ikiye ayrılmaz.
 * Bilinen sınır (T2 #34, kabul): tek bir parça MAX_CONTENT'i aşarsa (ör.
 * 55+ aktif oyuncunun tek tabloda birleşmesi) yine tek mesaj denenir —
 * Discord 400 dönerse ertesi gece retry; tabloyu satırlara bölmek bilinçli
 * olarak yapılmadı (arkadaş ölçeğinde erişilemez).
 */
export function composeDigestParts({ pending, allFinished, players, predictions, scoring, siteUrl }) {
  const activePlayers = (players ?? []).filter(p => p.is_active)
  const playersById = new Map(activePlayers.map(p => [p.id, p]))
  const predsByMatch = new Map()
  for (const p of predictions ?? []) {
    if (!predsByMatch.has(p.match_id)) predsByMatch.set(p.match_id, [])
    predsByMatch.get(p.match_id).push(p)
  }

  const ordered = [...pending].sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)))

  // #33: maçlar (lig, sezon)'e göre gruplanır; bölümler ilk maçın vuruş
  // sırasına dizilir (gecenin akışı). Bölüm başlığı (🏟 … · Lig · Tarih)
  // bölümün İLK maç bloğuna eklenir → başlık maçlarından koparılamaz.
  const groups = []
  for (const match of ordered) {
    let group = groups.find(g => g.league === match.league && g.seasonYear === match.season_year)
    if (!group) {
      group = { league: match.league, seasonYear: match.season_year, matches: [] }
      groups.push(group)
    }
    group.matches.push(match)
  }
  groups.sort((a, b) => String(a.matches[0].kickoff).localeCompare(String(b.matches[0].kickoff)))

  const matchBlocks = groups.flatMap(group => {
    const label = LEAGUE_BY_CODE[group.league]?.name ?? group.league
    const header = `🏟 Tahmin Ligi · ${label} · ${dateLabel(group.matches.map(m => m.kickoff))}`
    const blocks = group.matches.map(match => {
      const rows = (predsByMatch.get(match.id) ?? [])
        .map(p => ({ player: playersById.get(p.player_id), outcome: p.outcome }))
        .filter(r => r.player && r.outcome)
        .map(r => {
          const correct = r.outcome === outcomeOf(match.home_score, match.away_score)
          // #33: puan eki yok — ✅/❌ + isim, alt alta (kullanıcı onayı).
          const name = sanitizeName(r.player.name)
          return { name, correct, text: correct ? `✅ ${name}` : `❌ ${name}` }
        })
      rows.sort((a, b) => Number(b.correct) - Number(a.correct) || a.name.localeCompare(b.name, 'tr'))
      const tag = COMP_TAGS[match.competition]
      const title =
        `${match.home_short ?? match.home_name} ${match.home_score}-${match.away_score} ` +
        `${match.away_short ?? match.away_name}${tag ? ` (${tag})` : ''}`
      // Uygun satır kalmadıysa (yalnız doğrudan çağrıda erişilebilir) başlık
      // tek başına durur — sondaki boş satır bırakılmaz (T2 #34).
      return {
        text: rows.length > 0 ? `${title}\n${rows.map(r => r.text).join('\n')}` : title,
        matchIds: [match.id],
      }
    })
    blocks[0].text = `${header}\n${blocks[0].text}`
    return blocks
  })

  // Puan durumu (#33): özette maçı olan her ayrı (lig, sezon) için — sitenin
  // puan tablosuyla aynı hesap (aktif oyuncular, doğru sonuç × correctOutcome).
  // Satırlar kod bloğu tablosuyla hizalı yazılır; boş tablo üretilmez.
  const standingsBlocks = []
  for (const group of groups) {
    const scoped = (allFinished ?? []).filter(m =>
      m.league === group.league && m.season_year === group.seasonYear &&
      m.home_score != null && m.away_score != null)
    const rows = activePlayers.map(player => {
      let points = 0
      for (const match of scoped) {
        const outcome = (predsByMatch.get(match.id) ?? []).find(p => p.player_id === player.id)?.outcome
        if (outcome && outcome === outcomeOf(match.home_score, match.away_score)) {
          points += scoring.correctOutcome
        }
      }
      return { name: sanitizeName(player.name), points }
    })
    rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'tr'))
    const table = standingsTable(rows)
    if (!table) continue
    const label = LEAGUE_BY_CODE[group.league]?.name ?? group.league
    standingsBlocks.push({ text: `📊 ${label} Puan Durumu\n${table}`, matchIds: [] })
  }

  // Site linki (#33): SON puan bloğuna yapışık — mesaj bölünse bile link tek
  // başına dangıl dungul kalmaz. Masked link webhook mesajlarında tıklanabilir.
  // Koruma (T2 #34): görünen metin boşsa veya markdown kırıcı parantez/
  // köşeli parantez taşıyorsa masked link kurulmaz — düz metin düşer.
  const url = siteUrl ?? DEFAULT_SITE_URL
  const display = url.startsWith('https://') ? url.slice('https://'.length) : ''
  const link = display !== '' && !/[()[\]]/.test(display)
    ? `🔗 [${display}](${url})`
    : `🔗 ${url}`
  if (standingsBlocks.length > 0) {
    standingsBlocks[standingsBlocks.length - 1].text += `\n\n${link}`
  } else {
    standingsBlocks.push({ text: link, matchIds: [] })
  }

  return [...matchBlocks, ...standingsBlocks]
}

/**
 * Parçaları ≤maxLen Discord mesajlarına paketler (greedy; maç bloğu asla
 * bölünmez). Her mesaj hangi maçları taşıdığını bildirir → parça parça
 * gönderimde yalnız TESLİM EDİLEN parçaların maçları flag'lenebilir.
 */
export function packChunks(parts, maxLen = MAX_CONTENT) {
  const chunks = []
  let current = null
  for (const part of parts ?? []) {
    if (!part?.text) continue
    if (current === null) {
      current = { text: part.text, matchIds: [...(part.matchIds ?? [])] }
    } else if (current.text.length + 2 + part.text.length <= maxLen) {
      current.text += `\n\n${part.text}`
      current.matchIds.push(...(part.matchIds ?? []))
    } else {
      chunks.push(current)
      current = { text: part.text, matchIds: [...(part.matchIds ?? [])] }
    }
  }
  if (current !== null) chunks.push(current)
  return chunks
}

/**
 * Discord webhook'a tek mesaj gönderir. allowed_mentions tamamen kapalı;
 * hata durumunda yalnız durum kodu raporlanır (webhook URL'i asla metne girmez).
 */
export async function postDiscord(webhookUrl, content) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  })
  if (!res.ok) throw new Error(`Discord webhook ${res.status}`)
}

/** Flag satırlarını idempotent yazar (on conflict do nothing). */
async function flagMatches(supabase, matchRows) {
  if (matchRows.length === 0) return
  const rows = matchRows.map(m => ({
    match_id: m.id,
    // league şemada NOT NULL; R7 hayalet satırlarında null gelebilir → onarım
    // değerine düş (senkron toRow ile aynı varsayım).
    league: m.league ?? 'EU',
    season_year: m.season_year,
    home_name: m.home_name,
    away_name: m.away_name,
    home_score: m.home_score,
    away_score: m.away_score,
  }))
  const { error } = await supabase
    .from('match_notifications')
    .upsert(rows, { onConflict: 'match_id', ignoreDuplicates: true })
  if (error) throw new Error(`Bildirim flag'i yazılamadı: ${error.message}`)
}

/**
 * Gece özeti akışı (api/notify.js ve scripts/notify-dry.mjs ortak kullanır).
 * opts.webhookUrl yoksa OTOMATİK dry-run (hiçbir şey yazılmaz/gönderilmez).
 * opts.send → test enjeksiyonu (varsayılan postDiscord). opts.siteUrl → özet
 * altındaki site linki (öntanımlı: SITE_URL env, yoksa DEFAULT_SITE_URL).
 * Dönen özet webhook URL'i içermez; chunks yalnız dry-run'da taşınır.
 */
export async function runNightlyNotify(supabase, opts = {}) {
  const dry = opts.dry ?? !opts.webhookUrl
  const send = opts.send ?? postDiscord

  const [matchesRes, notifiedRes, playersRes, predictionsRes, scoringRes] = await Promise.all([
    supabase.from('matches')
      .select('id, league, season_year, competition, kickoff, status, home_name, home_short, away_name, away_short, home_score, away_score')
      .in('status', FINISHED_STATUSES),
    supabase.from('match_notifications').select('match_id'),
    supabase.from('players').select('id, name, is_active'),
    supabase.from('predictions').select('player_id, match_id, outcome'),
    supabase.from('app_config').select('value').eq('key', 'scoring').maybeSingle(),
  ])
  const errors = [matchesRes, notifiedRes, playersRes, predictionsRes, scoringRes].filter(r => r.error)
  if (errors.length > 0) throw new Error(errors[0].error.message)

  const scoring = { correctOutcome: 1, ...(scoringRes.data?.value ?? {}) }
  const notified = new Set((notifiedRes.data ?? []).map(r => r.match_id))
  const players = playersRes.data ?? []
  const predictions = predictionsRes.data ?? []
  const activeIds = new Set(players.filter(p => p.is_active).map(p => p.id))
  const predsByMatch = new Map()
  for (const p of predictions) {
    if (!activeIds.has(p.player_id)) continue
    if (!predsByMatch.has(p.match_id)) predsByMatch.set(p.match_id, [])
    predsByMatch.get(p.match_id).push(p)
  }

  // Bitmiş + flag'siz; skoru oturmuş satırlar (final olmayan FINISHED atlanır).
  const finished = (matchesRes.data ?? []).filter(m =>
    m.home_score != null && m.away_score != null && !notified.has(m.id))
  const pending = finished.filter(m => (predsByMatch.get(m.id)?.length ?? 0) > 0)
  const noPred = finished.filter(m => (predsByMatch.get(m.id)?.length ?? 0) === 0)

  const base = {
    dry,
    pendingCount: pending.length,
    skippedNoPred: noPred.length,
  }

  if (pending.length === 0) {
    // Gönderilecek şey yok; tahminsizleri yine de flag'le (bir daha bakmayalım).
    if (!dry) await flagMatches(supabase, noPred)
    return { ...base, sent: false, messageCount: 0, chunks: [] }
  }

  const parts = composeDigestParts({
    pending,
    allFinished: matchesRes.data ?? [],
    players,
    predictions,
    scoring,
    siteUrl: opts.siteUrl ?? process.env.SITE_URL,
  })
  const chunks = packChunks(parts)

  if (dry) {
    return { ...base, sent: false, messageCount: chunks.length, chunks: chunks.map(c => c.text) }
  }

  // Gönderim: parça parça. Başarısız parçada durulur; TESLİM EDİLEN parçaların
  // maçları flag'lenir (kısmi tekrar önlenir), kalanlar ertesi gece retry.
  const byId = new Map(finished.map(m => [m.id, m]))
  const delivered = []
  let failure = null
  for (let i = 0; i < chunks.length; i += 1) {
    try {
      await send(opts.webhookUrl, chunks[i].text)
      delivered.push(...chunks[i].matchIds)
    } catch (err) {
      failure = err.message
      break
    }
  }
  await flagMatches(supabase, delivered.map(id => byId.get(id)).filter(Boolean))
  if (failure !== null) {
    return { ...base, sent: delivered.length > 0, messageCount: chunks.length, deliveredCount: delivered.length, error: failure }
  }
  // Tam teslim: gönderilenler + tahminsizler flag'lenir.
  await flagMatches(supabase, [...delivered.map(id => byId.get(id)).filter(Boolean), ...noPred])
  return { ...base, sent: true, messageCount: chunks.length, deliveredCount: delivered.length }
}
