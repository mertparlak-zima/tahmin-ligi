// Herkese açık lig verisi: maçlar (mühürlü tahminler), puan durumu, meta.

import { COMPETITIONS } from './targets.js'
import { teamCode } from './targets.js'
import { isFinished, isInactive, isLive, isStarted, statusGroup } from './status.js'

const TIMEZONE = 'Europe/Istanbul'

export const DEFAULT_SCORING = {
  label: 'Doğru sonuç 1 puan',
  status: 'provisional',
  correctOutcome: 1,
}

const todayKey = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

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

function matchStub(match) {
  return {
    id: match.id,
    competitionCode: match.competition,
    kickoff: match.kickoff,
    homeShort: match.home_short ?? match.home_name,
    awayShort: match.away_short ?? match.away_name,
    score: isFinished(match.status)
      ? { home: match.home_score ?? 0, away: match.away_score ?? 0 }
      : null,
    status: match.status,
  }
}

export async function buildLeaguePayload(supabase) {
  const [playersRes, matchesRes, predictionsRes, configRes, syncRes] = await Promise.all([
    supabase.from('players').select('*').order('name', { ascending: true }),
    supabase.from('matches').select('*').order('kickoff', { ascending: true }),
    supabase.from('predictions').select('player_id, match_id, outcome'),
    supabase.from('app_config').select('value').eq('key', 'scoring').maybeSingle(),
    supabase.from('sync_state').select('*').eq('id', 1).maybeSingle(),
  ])

  const allPlayers = playersRes.data ?? []
  const activePlayers = allPlayers.filter(p => p.is_active)
  const matches = matchesRes.data ?? []
  const predictions = predictionsRes.data ?? []
  const scoring = { ...DEFAULT_SCORING, ...(configRes.data?.value ?? {}) }
  const syncState = syncRes.data ?? null

  const now = Date.now()
  const playersById = new Map(allPlayers.map(p => [p.id, p]))

  // Tahminler: {matchId: Map<playerId, outcome>}
  const predictionsByMatch = new Map()
  for (const p of predictions) {
    if (!predictionsByMatch.has(p.match_id)) predictionsByMatch.set(p.match_id, new Map())
    predictionsByMatch.get(p.match_id).set(p.player_id, p.outcome)
  }

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
      const outcome = matchPredictions?.get(player.id)
      if (!outcome) continue
      const row = {
        playerId: player.id,
        name: player.name,
        initials: initialsOf(player.name),
        color: player.color,
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
  const standings = []
  for (const player of activePlayers) {
    const row = {
      id: player.id,
      name: player.name,
      color: player.color,
      initials: initialsOf(player.name),
      points: 0,
      played: 0,
      missed: 0,
      correctOutcomes: 0,
      teamCorrect: { FB: 0, GS: 0, BJK: 0, TS: 0 },
      form: [],
      accuracy: 0,
    }
    for (const match of finishedMatches) {
      const outcome = predictionsByMatch.get(match.id)?.get(player.id)
      if (!outcome) {
        row.missed += 1
        continue
      }
      row.played += 1
      const actual = outcomeOf(match.home_score, match.away_score)
      if (outcome === actual) {
        row.points += scoring.correctOutcome
        row.correctOutcomes += 1
        row.form.push(scoring.correctOutcome)
        for (const name of [match.home_name, match.away_name]) {
          const code = teamCode(name)
          if (code) row.teamCorrect[code] += 1
        }
      } else {
        row.form.push(0)
      }
    }
    row.form = row.form.slice(-5)
    row.accuracy = row.played > 0 ? Math.round((row.correctOutcomes / row.played) * 100) : 0
    standings.push(row)
  }

  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.correctOutcomes !== a.correctOutcomes) return b.correctOutcomes - a.correctOutcomes
    return a.name.localeCompare(b.name, 'tr')
  })
  const leaderPoints = standings[0]?.points ?? 0
  standings.forEach((row, index) => {
    row.rank = index + 1
    row.behind = leaderPoints - row.points
  })

  // --- Meta ---
  const liveCount = matchItems.filter(m => m.isLive).length
  const finishedCount = matchItems.filter(m => m.isFinished).length
  const upcomingCount = matchItems.filter(m => m.statusGroup === 'upcoming').length
  const nextMatch = matchItems.find(m => m.statusGroup === 'upcoming') ?? null
  const lastFinished = finishedCount > 0 ? [...matchItems].reverse().find(m => m.isFinished) : null

  return {
    meta: {
      leagueName: process.env.LEAGUE_NAME || 'Tahmin Ligi',
      generatedAt: new Date().toISOString(),
      timezone: TIMEZONE,
      today: todayKey(),
      scoring,
      sync: {
        lastAttemptAt: syncState?.last_attempt_at ?? null,
        lastSuccessAt: syncState?.last_success_at ?? null,
        lastError: syncState?.last_error ?? null,
        matchesSeen: syncState?.matches_seen ?? 0,
      },
      counts: {
        players: activePlayers.length,
        matches: matchItems.length,
        finished: finishedCount,
        live: liveCount,
        upcoming: upcomingCount,
      },
      leader: standings[0] ? { name: standings[0].name, points: standings[0].points } : null,
      nextMatch: nextMatch ? matchStub(matches.find(m => m.id === nextMatch.id)) : null,
      lastFinished: lastFinished ? matchStub(matches.find(m => m.id === lastFinished.id)) : null,
    },
    players: activePlayers.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      initials: initialsOf(p.name),
    })),
    competitions: COMPETITIONS,
    matches: matchItems,
    standings,
  }
}

/** Admin paneli için ham veri (tüm oyuncular, kilit bayrakları, tahmin haritası). */
export async function buildAdminPayload(supabase) {
  const [playersRes, matchesRes, predictionsRes, configRes, syncRes] = await Promise.all([
    supabase.from('players').select('*').order('name', { ascending: true }),
    supabase.from('matches').select('*').order('kickoff', { ascending: true }),
    supabase.from('predictions').select('player_id, match_id, outcome'),
    supabase.from('app_config').select('value').eq('key', 'scoring').maybeSingle(),
    supabase.from('sync_state').select('*').eq('id', 1).maybeSingle(),
  ])

  const now = Date.now()
  const matches = matchesRes.data ?? []
  const predictions = predictionsRes.data ?? []

  const predictionMap = {}
  for (const p of predictions) {
    predictionMap[`${p.player_id}:${p.match_id}`] = p.outcome
  }

  return {
    players: (playersRes.data ?? []).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isActive: p.is_active,
      initials: initialsOf(p.name),
    })),
    matches: matches.map(m => ({
      id: m.id,
      competitionCode: m.competition,
      kickoff: m.kickoff,
      status: m.status,
      statusGroup: statusGroup(m.status),
      minute: m.minute ?? null,
      homeShort: m.home_short ?? m.home_name,
      awayShort: m.away_short ?? m.away_name,
      score: nullish(m.home_score) || nullish(m.away_score)
        ? null
        : { home: m.home_score, away: m.away_score },
      locked: isInactive(m.status) || isStarted(m.status, m.kickoff, now),
    })),
    predictions: predictionMap,
    scoring: { ...DEFAULT_SCORING, ...(configRes.data?.value ?? {}) },
    sync: syncRes.data ?? null,
  }
}
