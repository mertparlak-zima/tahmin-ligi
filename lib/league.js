// Herkese açık lig verisi: maçlar (mühürlü tahminler), puan durumu, meta.

import { LEAGUES, LEAGUE_BY_CODE, activeLeague, competitionsForLeague } from './targets.js'
import { teamCode } from './targets.js'
import { seasonYear } from './espn.js'
import { isFinished, isInactive, isLive, isStarted, statusGroup } from './status.js'

export const DEFAULT_SCORING = {
  label: 'Doğru sonuç 1 puan',
  status: 'provisional',
  correctOutcome: 1,
}

/** '2026-27' biçiminde sezon etiketi: yıl+1'in son iki hanesi. */
export function seasonLabel(year) {
  return `${year}-${String(year + 1).slice(-2)}`
}

export function initialsOf(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const letters = (parts[0][0] + (parts[1]?.[0] ?? '')).toLocaleUpperCase('tr-TR')
  return letters || '?'
}

export function outcomeOf(homeScore, awayScore) {
  if (homeScore > awayScore) return 'H'
  if (homeScore < awayScore) return 'A'
  return 'D'
}

function outcomeLabel(outcome, home, away) {
  if (outcome === 'D') return 'Beraberlik'
  return `${outcome === 'H' ? home.short : away.short} yener`
}

const nullish = v => v === null || v === undefined

/** Bitmiş maçlardan takım bazlı son 5 sonuç: G (galibiyet), B (beraberlik), M (mağlubiyet). */
function buildTeamForms(finishedMatches) {
  const forms = new Map()
  for (const match of finishedMatches) {
    const { home_score, away_score } = match
    if (nullish(home_score) || nullish(away_score)) continue
    const push = (name, letter) => {
      const key = String(name)
      if (!forms.has(key)) forms.set(key, [])
      const arr = forms.get(key)
      arr.push(letter)
      if (arr.length > 5) arr.shift()
    }
    if (home_score > away_score) {
      push(match.home_name, 'G'); push(match.away_name, 'M')
    } else if (home_score < away_score) {
      push(match.home_name, 'M'); push(match.away_name, 'G')
    } else {
      push(match.home_name, 'B'); push(match.away_name, 'B')
    }
  }
  return forms
}

export async function buildLeaguePayload(supabase, opts = {}) {
  // (lig, sezon) seçimi: opts yoksa aktif lig + aktif sezon (takvim devrinden
  // türetilir). Bilinmeyen lig kodu hata fırlatır → api 400 ile yanıtlar.
  const leagueCode = opts.league ?? activeLeague()
  if (!LEAGUE_BY_CODE[leagueCode]) throw new Error(`Bilinmeyen lig: ${leagueCode}`)
  const seasonYr = opts.seasonYear ?? seasonYear()

  // #24: sezonluk bonus puanlar KALDIRILDI — standings 0'dan başlar;
  // `bonus:<lig>:<sezon>` / `bonus:<sezon>` app_config anahtarları artık
  // okunmaz (veritabanında durursa etkisiz kalır).
  const [playersRes, matchesRes, seasonsRes, predictionsRes, scoringRes, syncRes] = await Promise.all([
    supabase.from('players').select('*').order('name', { ascending: true }),
    // Maç sorgusu DB tarafına iner: seçili (lig, sezon) satırları (P6).
    supabase.from('matches').select('*')
      .eq('league', leagueCode)
      .eq('season_year', seasonYr)
      .order('kickoff', { ascending: true }),
    // Sezon listesi seçili ligin TÜM sezonlarından gelir (payload yalnız tek
    // sezonun maçlarını taşır; "Geçmiş Sezonlar" seçicisi buna ihtiyaç duyar).
    // Basit select + JS distinct yeterli (satır sayısı küçük).
    supabase.from('matches').select('season_year').eq('league', leagueCode),
    // U9: created_at/updated_at akış olayları için satırla gelir (giriş ve
    // güncelleme ayrımı). Mühür hassasiyeti YOKTUR — kimin girdiği zaten açık.
    supabase.from('predictions').select('player_id, match_id, outcome, created_at, updated_at'),
    // Puanlama kuralı KÜRESEL tek anahtardır (`scoring`; lig bazlı değil).
    supabase.from('app_config').select('value').eq('key', 'scoring').maybeSingle(),
    supabase.from('sync_state').select('*').eq('id', 1).maybeSingle(),
  ])

  const allPlayers = playersRes.data ?? []
  const activePlayers = allPlayers.filter(p => p.is_active)
  const matches = matchesRes.data ?? []
  const predictions = predictionsRes.data ?? []
  const scoring = { ...DEFAULT_SCORING, ...(scoringRes.data?.value ?? {}) }
  const syncState = syncRes.data ?? null

  const now = Date.now()
  const playersById = new Map(allPlayers.map(p => [p.id, p]))

  // Tahminler: {matchId: Map<playerId, satır>} — outcome ile birlikte U9
  // zaman damgaları (created_at/updated_at) da satırdan okunur.
  const predictionsByMatch = new Map()
  for (const p of predictions) {
    if (!predictionsByMatch.has(p.match_id)) predictionsByMatch.set(p.match_id, new Map())
    predictionsByMatch.get(p.match_id).set(p.player_id, p)
  }

  // #21 T3 review: akış olayları (recentPredictions) bu payload'ın maç
  // kapsamıyla sınırlı — diğer ligin girişleri kotası dışarı itmesin.
  const matchIds = new Set(matches.map(m => m.id))

  const finishedMatches = matches
    .filter(m => isFinished(m.status) && !nullish(m.home_score) && !nullish(m.away_score))
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
  const teamForms = buildTeamForms(finishedMatches)

  // --- Maç listesi ---
  const matchItems = matches.map(match => {
    const started = isStarted(match.status, match.kickoff, now)
    const inactive = isInactive(match.status)
    const finished = isFinished(match.status) && !nullish(match.home_score) && !nullish(match.away_score)
    const visible = started && !inactive

    const matchPredictions = predictionsByMatch.get(match.id)
    const playerRows = []
    for (const player of activePlayers) {
      const pred = matchPredictions?.get(player.id)
      const outcome = pred?.outcome
      if (!outcome) continue
      const row = {
        playerId: player.id,
        name: player.name,
        initials: initialsOf(player.name),
        color: player.color,
        // #17: kolon şemada yoksa (deploy sırası) null ile düşer.
        avatarUrl: player.avatar_url ?? null,
      }
      if (visible) {
        row.outcome = outcome
        if (finished) {
          const correct = outcome === outcomeOf(match.home_score, match.away_score)
          row.correct = correct
          row.points = correct ? scoring.correctOutcome : 0
        } else {
          row.correct = null
          row.points = null
        }
      }
      playerRows.push(row)
    }

    const home = {
      name: match.home_name,
      short: match.home_short ?? match.home_name,
      tla: match.home_tla,
      crest: match.home_crest,
      form: teamForms.get(match.home_name) ?? [],
    }
    const away = {
      name: match.away_name,
      short: match.away_short ?? match.away_name,
      tla: match.away_tla,
      crest: match.away_crest,
      form: teamForms.get(match.away_name) ?? [],
    }

    // outcomeLabel'a kısa isimleri ver.
    for (const row of playerRows) {
      if (row.outcome) row.label = outcomeLabel(row.outcome, home, away)
    }

    playerRows.sort((a, b) => {
      if (a.points === b.points) return a.name.localeCompare(b.name, 'tr')
      if (a.points === null || a.points === undefined) return 1
      if (b.points === null || b.points === undefined) return -1
      return b.points - a.points
    })

    return {
      id: match.id,
      competitionCode: match.competition,
      kickoff: match.kickoff,
      status: match.status,
      statusGroup: statusGroup(match.status),
      minute: match.minute ?? null,
      home,
      away,
      score: nullish(match.home_score) || nullish(match.away_score)
        ? null
        : { home: match.home_score, away: match.away_score },
      isLive: isLive(match.status),
      isFinished: finished,
      isStarted: started,
      predictionsVisible: visible,
      predictionCount: playerRows.length,
      predictions: playerRows,
    }
  })

  // --- Puan durumu ---
  // #24: bonus yok — her oyuncu 0'dan başlar, tek kural `scoring.correctOutcome`.
  const standings = []
  for (const player of activePlayers) {
    const row = {
      id: player.id,
      name: player.name,
      color: player.color,
      initials: initialsOf(player.name),
      avatarUrl: player.avatar_url ?? null,
      points: 0,
      played: 0,
      correctOutcomes: 0,
      teamCorrect: { FB: 0, GS: 0, BJK: 0, TS: 0 },
      accuracy: 0,
    }
    for (const match of finishedMatches) {
      const outcome = predictionsByMatch.get(match.id)?.get(player.id)?.outcome
      if (!outcome) continue
      row.played += 1
      const actual = outcomeOf(match.home_score, match.away_score)
      if (outcome === actual) {
        row.points += scoring.correctOutcome
        row.correctOutcomes += 1
        for (const name of [match.home_name, match.away_name]) {
          const code = teamCode(name)
          if (code) row.teamCorrect[code] += 1
        }
      }
    }
    row.accuracy = row.played > 0 ? Math.round((row.correctOutcomes / row.played) * 100) : 0
    standings.push(row)
  }

  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.correctOutcomes !== a.correctOutcomes) return b.correctOutcomes - a.correctOutcomes
    return a.name.localeCompare(b.name, 'tr')
  })
  standings.forEach((row, index) => {
    row.rank = index + 1
  })

  // --- Meta ---
  const liveCount = matchItems.filter(m => m.isLive).length
  const finishedCount = matchItems.filter(m => m.isFinished).length
  const upcomingCount = matchItems.filter(m => m.statusGroup === 'upcoming').length

  // Sezon listesi: seçili ligin matches satırlarındaki distinct season_year
  // değerleri (null hariç), yeniden eskiye sıralı (P6 "Geçmiş Sezonlar").
  const seasonYears = [...new Set(
    (seasonsRes.data ?? []).map(r => r.season_year).filter(y => y != null),
  )].sort((a, b) => b - a)
  const seasons = seasonYears.map(y => ({ year: y, label: seasonLabel(y) }))

  return {
    meta: {
      leagueName: process.env.LEAGUE_NAME || 'Tahmin Ligi',
      generatedAt: new Date().toISOString(),
      // Seçili (lig, sezon) bağlamı + seçilebilir sezonlar + aktif ligler (P5/P6).
      season: { year: seasonYr, label: seasonLabel(seasonYr) },
      seasons,
      leagues: LEAGUES.filter(l => l.active),
      scoring,
      sync: {
        lastAttemptAt: syncState?.last_attempt_at ?? null,
        lastSuccessAt: syncState?.last_success_at ?? null,
        // Son başarılı senkronizasyonun yaşı (dakika); hiç başarılmadıysa null.
        // Bayatlık bandının tetikleyicisi (P4).
        lastSuccessAgeMinutes: syncState?.last_success_at
          ? Math.max(0, Math.round((now - Date.parse(syncState.last_success_at)) / 60_000))
          : null,
        lastError: syncState?.last_error ?? null,
      },
      counts: {
        players: activePlayers.length,
        matches: matchItems.length,
        finished: finishedCount,
        live: liveCount,
        upcoming: upcomingCount,
      },
      leader: standings[0] ? { name: standings[0].name, points: standings[0].points } : null,
    },
    // U9 Akış: son tahmin olayları — yalnız kim + hangi maç + damga.
    // Outcome ASLA taşınmaz (mühür kuralı); son 30 olay updated_at desc.
    // #21 T3 review: olaylar BU payload'ın maçlarıyla sınırlanır — global
    // top-30'da diğer ligin yoğun girişleri bu ligin akışını dışarı itiyordu.
    recentPredictions: [...predictions]
      .filter(p => matchIds.has(p.match_id))
      .sort((a, b) =>
        Date.parse(b.updated_at ?? b.created_at ?? 0) - Date.parse(a.updated_at ?? a.created_at ?? 0))
      .slice(0, 30)
      .map(p => ({
        playerId: p.player_id,
        matchId: p.match_id,
        enteredAt: p.created_at ?? null,
        updatedAt: p.updated_at ?? null,
      })),
    players: activePlayers.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      initials: initialsOf(p.name),
      avatarUrl: p.avatar_url ?? null,
    })),
    // Payload yalnız kod + ad taşır (sortOrder lib içi sabittir, UI kullanmaz);
    // liste lig kapsamına iner (#21: TSL → yalnız Süper Lig).
    competitions: competitionsForLeague(leagueCode).map(c => ({ code: c.code, name: c.name })),
    matches: matchItems,
    standings,
  }
}

// #24 Faz 1: buildAdminPayload (yönetim paneli ham verisi) KALDIRILDI —
// şifreli admin API'si yerine herkese açık /api/predictions + /api/players
// uçları geçti; panelin veri ihtiyacı Faz 2'de public payload'dan karşılanır.

