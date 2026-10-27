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
// Biçim:
//   🏟 Tahmin Ligi · 27 Eki Pzt
//
//   Galatasaray 2-0 Samsunspor
//   Ogün ✅ +1 · Mert ❌ 0
//
//   Beşiktaş 1-1 Lyon (ŞL)
//   Ece ✅ +1
//
//   📊 Süper Lig: 1. Ogün 3 · 2. Ece 2 · 3. Mert 1

import { FINISHED_STATUSES } from './status.js'
import { outcomeOf } from './league.js'
import { LEAGUE_BY_CODE } from './targets.js'

// Discord içerik sınırı 2000; güvenlik payı.
const MAX_CONTENT = 1900

// Kısa turnuva etiketleri: TSL etiketsiz (öntanımlı), UEFA kupaları etiketli —
// iki lig aynı özetteyken Avrupa maçı karışmasın.
const COMP_TAGS = { CL: 'ŞL', EL: 'AL', UECL: 'KL' }

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
 * Özet parçalarını üretir (saf — test edilir).
 * pending: gönderilecek bitmiş maç satırları; allFinished: puan durumu için
 * (lig, sezon)'in TÜM bitmiş maçları; predictions: {player_id, match_id, outcome}.
 * Dönen parçalar packChunks ile mesajlara paketlenir.
 */
export function composeDigestParts({ pending, allFinished, players, predictions, scoring }) {
  const activePlayers = (players ?? []).filter(p => p.is_active)
  const playersById = new Map(activePlayers.map(p => [p.id, p]))
  const predsByMatch = new Map()
  for (const p of predictions ?? []) {
    if (!predsByMatch.has(p.match_id)) predsByMatch.set(p.match_id, [])
    predsByMatch.get(p.match_id).push(p)
  }

  const ordered = [...pending].sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)))

  const header = { text: `🏟 Tahmin Ligi · ${dateLabel(ordered.map(m => m.kickoff))}`, matchIds: [] }

  const matchBlocks = ordered.map(match => {
    const rows = (predsByMatch.get(match.id) ?? [])
      .map(p => ({ player: playersById.get(p.player_id), outcome: p.outcome }))
      .filter(r => r.player && r.outcome)
      .map(r => {
        const correct = r.outcome === outcomeOf(match.home_score, match.away_score)
        return {
          name: sanitizeName(r.player.name),
          correct,
          text: `${sanitizeName(r.player.name)} ${correct ? `✅ +${scoring.correctOutcome}` : '❌ 0'}`,
        }
      })
    rows.sort((a, b) => Number(b.correct) - Number(a.correct) || a.name.localeCompare(b.name, 'tr'))
    const tag = COMP_TAGS[match.competition]
    const title =
      `${match.home_short ?? match.home_name} ${match.home_score}-${match.away_score} ` +
      `${match.away_short ?? match.away_name}${tag ? ` (${tag})` : ''}`
    return { text: `${title}\n${rows.map(r => r.text).join(' · ')}`, matchIds: [match.id] }
  })

  // Puan satırı: özette maçı olan her ayrı (lig, sezon) için — sitenin puan
  // tablosuyla aynı hesap (aktif oyuncular, doğru sonuç × correctOutcome).
  const scopes = []
  for (const match of ordered) {
    const key = `${match.league}:${match.season_year}`
    if (!scopes.some(s => s.key === key)) scopes.push({ key, league: match.league, seasonYear: match.season_year })
  }
  const standingsLines = scopes.map(({ league, seasonYear }) => {
    const scoped = (allFinished ?? []).filter(m =>
      m.league === league && m.season_year === seasonYear &&
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
    const label = LEAGUE_BY_CODE[league]?.name ?? league
    const line = rows.map((r, i) => `${i + 1}. ${r.name} ${r.points}`).join(' · ')
    return `📊 ${label}: ${line}`
  })
  const standingsBlock = { text: standingsLines.join('\n'), matchIds: [] }

  return [header, ...matchBlocks, standingsBlock]
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
 * opts.send → test enjeksiyonu (varsayılan postDiscord).
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

  const parts = composeDigestParts({ pending, allFinished: matchesRes.data ?? [], players, predictions, scoring })
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
