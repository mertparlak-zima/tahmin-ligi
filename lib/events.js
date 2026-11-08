// İşlem Geçmişi (#40): tahmin hareketlerinin denetim katmanı.
// Akış (api/predictions.js ve demo sunucu ortak kullanır):
//   savePredictions yazma ÖNCESİ mevcut değerleri okur → yazma SONRASI
//   deriveEvents no-op'ları ayıklar → prediction_events'e ekler (best-effort:
//   olay yazımı patlarsa tahmin kaydı yine KURTULUR, yalnız log).
// Gizlilik (sahibi kararı 2026-11-06): tam IP + konum + User-Agent yalnız
// DB'de; buildEventsPayload istemciye MASKELİ IP dışında IP taşımaz.

import { initialsOf } from './league.js'
import { statusGroup } from './status.js'

/** Maskeli IP görünümü (UI/API çıkışı): IPv4 ilk 2 oktet açık
 *  (85.110.••.••), IPv6 ilk 2 grup açık, çözümlenemeyen → '••'.
 *  Tam IP ASLA istemciye gitmez. */
export function maskIp(ip) {
  let raw = String(ip ?? '').trim()
  if (raw === '') return null
  // IPv4'e eşlenmiş IPv6 (::ffff:85.110.5.5) → düz IPv4 gibi maskele.
  if (raw.toLowerCase().startsWith('::ffff:')) raw = raw.slice(7)
  if (raw.includes('.')) {
    const octets = raw.split('.')
    if (octets.length === 4 && octets.every(o => /^\d{1,3}$/.test(o))) {
      return `${octets[0]}.${octets[1]}.••.••`
    }
    return '••'
  }
  const groups = raw.split(':').filter(g => g !== '')
  if (groups.length >= 2) return `${groups[0]}:${groups[1]}:••:••`
  return '••'
}

/** Hafif User-Agent parse'ı (bağımlılık yok): tarayıcı + OS + cihaz türü.
 *  Boş/tekil UA → null. Ham string de DB'de saklanır; bu yalnız özet. */
export function parseUserAgent(ua) {
  const s = String(ua ?? '').trim()
  if (s === '') return null
  let browser = 'Bilinmiyor'
  let os = 'Bilinmiyor'
  let device = 'Masaüstü'
  // Sıra önemli: Edge/Opera/Brave "Chrome" alt stringi de taşır.
  if (/edg\//i.test(s) || /edga\//i.test(s)) browser = 'Edge'
  else if (/opr\/|opera/i.test(s)) browser = 'Opera'
  else if (/samsungbrowser/i.test(s)) browser = 'Samsung Internet'
  else if (/firefox\//i.test(s)) browser = 'Firefox'
  else if (/chrome\//i.test(s)) browser = 'Chrome'
  else if (/safari\//i.test(s)) browser = 'Safari'
  if (/windows nt/i.test(s)) os = 'Windows'
  else if (/iphone|ipod/i.test(s)) os = 'iOS'
  else if (/ipad/i.test(s)) os = 'iPadOS'
  else if (/android/i.test(s)) os = 'Android'
  else if (/mac os x/i.test(s)) os = 'macOS'
  else if (/linux/i.test(s)) os = 'Linux'
  if (/ipad|tablet/i.test(s)) device = 'Tablet'
  else if (/mobi|iphone|ipod|android/i.test(s)) device = 'Telefon'
  return { browser, os, device }
}

const decodeHeader = v => {
  const raw = String(v ?? '').trim()
  if (raw === '') return null
  // Vercel şehir adını URL-encode edebilir (Türkçe karakterler).
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** İstek meta verisi (denetim satırına yazılır):
 *  ip: x-real-ip öncelikli, yoksa x-forwarded-for'un SON girdisi (maho
 *  clientKey deseni — zincire istemcinin eklediği baştakiler değil, proxy'nin
 *  eklediği son girdi güvenlidir); yoksa null (yerel dev).
 *  Konum: Vercel'in ücretsiz verdiği x-vercel-ip-city/country/region
 *  header'ları (dış GeoIP servisi YOK). */
export function requestMetaOf(request) {
  const h = request?.headers
  const get = k => {
    try {
      return h?.get(k) ?? null
    } catch {
      return null
    }
  }
  const realIp = String(get('x-real-ip') ?? '').trim()
  const parts = String(get('x-forwarded-for') ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return {
    ip: realIp !== '' ? realIp : parts.length > 0 ? parts[parts.length - 1] : null,
    ipCity: decodeHeader(get('x-vercel-ip-city')),
    ipCountry: decodeHeader(get('x-vercel-ip-country')),
    ipRegion: decodeHeader(get('x-vercel-ip-country-region')),
    userAgent: String(get('user-agent') ?? '').trim() || null,
  }
}

/** Olay türetimi (saf — test edilir): items + eski değerler → olay satırları.
 *  No-op (değer değişmeyen yeniden kayıt, olmayan satırı silme) YAZILMAZ.
 *  oldByMatch: Map<matchId, 'H'|'D'|'A'> — satır yoksa anahtar yoktur.
 *  created_at: batch içinde ms başına +1 artan (bellek-içi depolarda da
 *  kararlı sıra; Postgres'te mikro saniye zaten ayrıştırır). */
export function deriveEvents({ items, oldByMatch, meta, playerId = null, now = Date.now() }) {
  const rows = []
  let seq = 0
  for (const item of items) {
    const old = oldByMatch.get(item.matchId)
    let action = null
    let oldOutcome = null
    let newOutcome = null
    if (item.outcome === '') {
      // Silme: satır yoksa no-op.
      if (old === undefined) continue
      action = 'DELETE'
      oldOutcome = old
    } else if (old === undefined) {
      action = 'CREATE'
      newOutcome = item.outcome
    } else if (old !== item.outcome) {
      action = 'UPDATE'
      oldOutcome = old
      newOutcome = item.outcome
    } else {
      continue // H→H: no-op, olay yazılmaz
    }
    rows.push({
      player_id: item.playerId ?? playerId,
      match_id: item.matchId,
      action,
      old_outcome: oldOutcome,
      new_outcome: newOutcome,
      ip: meta.ip,
      ip_city: meta.ipCity,
      ip_country: meta.ipCountry,
      ip_region: meta.ipRegion,
      user_agent: meta.userAgent,
      created_at: new Date(now + seq++).toISOString(),
    })
  }
  return rows
}

/** savePredictions'in yazma sonrası çağıracağı best-effort kayıt.
 *  Hata YÜKSELTMEZ: tahmin kaydı birincildir; olay yazımı yalnız loglanır. */
export async function recordPredictionEvents(supabase, request, { items, oldByMatch, playerId }) {
  try {
    const meta = requestMetaOf(request)
    const rows = deriveEvents({ items, oldByMatch, meta, playerId })
    if (rows.length === 0) return { written: 0 }
    const { error } = await supabase.from('prediction_events').insert(rows)
    if (error) throw error
    return { written: rows.length }
  } catch (err) {
    console.error('prediction_events kaydı yazılamadı:', err?.message ?? err)
    return { written: 0, error: String(err?.message ?? err) }
  }
}

/** GET /api/events çekirdeği: son `limit` olay, oyuncu+maç join'li,
 *  MASKELİ IP'li. Tam IP payload'a ASLA girmez (assert'le korunur —
 *  bkv. scripts/tests/events.test.mjs). */
export async function buildEventsPayload(supabase, { limit = 100 } = {}) {
  const { data: events, error } = await supabase.from('prediction_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const rows = events ?? []
  if (rows.length === 0) return { events: [] }

  const playerIds = [...new Set(rows.map(e => e.player_id))]
  const matchIds = [...new Set(rows.map(e => e.match_id))]
  const [playersRes, matchesRes] = await Promise.all([
    supabase.from('players').select('id, name, color, avatar_url').in('id', playerIds),
    supabase.from('matches')
      .select('id, competition, league, kickoff, status, home_name, home_short, home_score, away_name, away_short, away_score')
      .in('id', matchIds),
  ])
  const playerById = new Map((playersRes.data ?? []).map(p => [p.id, p]))
  const matchById = new Map((matchesRes.data ?? []).map(m => [m.id, m]))

  return {
    events: rows.map(e => {
      const player = playerById.get(e.player_id)
      const match = matchById.get(e.match_id)
      const nullishScore = match == null || match.home_score == null || match.away_score == null
      return {
        id: e.id,
        createdAt: e.created_at,
        action: e.action,
        oldOutcome: e.old_outcome ?? null,
        newOutcome: e.new_outcome ?? null,
        player: player
          ? {
              id: player.id,
              name: player.name,
              initials: initialsOf(player.name),
              color: player.color,
              avatarUrl: player.avatar_url ?? null,
            }
          : null,
        match: match
          ? {
              id: match.id,
              kickoff: match.kickoff,
              league: match.league,
              competition: match.competition,
              statusGroup: statusGroup(match.status),
              homeShort: match.home_short ?? match.home_name,
              awayShort: match.away_short ?? match.away_name,
              score: nullishScore ? null : { home: match.home_score, away: match.away_score },
            }
          : null,
        // Gizlilik: yalnız maskeli görüntü; tam IP DB'de kalır.
        ipMasked: maskIp(e.ip),
        ipCity: e.ip_city ?? null,
        ipCountry: e.ip_country ?? null,
        ipRegion: e.ip_region ?? null,
        userAgent: e.user_agent ?? null,
        ua: parseUserAgent(e.user_agent),
      }
    }),
  }
}
