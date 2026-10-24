// Akış (#20 U9): tahmin girişi/güncelleme + sonuç olaylarını türetir.
// SAF katman — DOM/store erşimi yok; Node'dan test edilir (calendar.js deseni).
// MÜHRÜN DEMİR KURALI: burada outcome HİÇBİR ŞEKİLDE türetilemez/taşınmaz —
// yalnız "kim, hangi maça, ne zaman girdi/güncelledi" bilgisi akar.

/** events: [{ id, type, at, matchId, compCode, teams, kickoff, ... }] desc, ilk `limit`. */
export function buildFlowEvents({ recentPredictions = [], matches = [], players = [], limit = 30, now = Date.now() }) {
  const playerById = new Map(players.map(p => [p.id, p]))
  const matchById = new Map(matches.map(m => [m.id, m]))
  const events = []

  for (const ev of recentPredictions) {
    const player = playerById.get(ev.playerId)
    const match = matchById.get(ev.matchId)
    if (!player || !match) continue
    const enteredAt = ev.enteredAt ?? null
    const updatedAt = ev.updatedAt ?? ev.enteredAt ?? null
    const kind = enteredAt && updatedAt && Date.parse(updatedAt) > Date.parse(enteredAt)
      ? 'updated'
      : 'entered'
    events.push({
      id: `pred:${ev.playerId}:${ev.matchId}:${updatedAt ?? ''}`,
      type: 'prediction',
      at: updatedAt,
      kind,
      playerId: player.id,
      playerName: player.name,
      playerInitials: player.initials ?? '?',
      playerColor: player.color ?? '#b8f34a',
      playerAvatarUrl: player.avatarUrl ?? null,
      matchId: match.id,
      compCode: match.competitionCode,
      teams: `${match.home?.short ?? '?'} – ${match.away?.short ?? '?'}`,
      kickoff: match.kickoff,
      // E5: ertelenmiş maçın girişi akışta "ertelendi" etiketiyle dürüst kalır.
      matchStatus: match.statusGroup,
      kickoffPast: match.kickoff ? Date.parse(match.kickoff) < now : false,
    })
  }

  for (const m of matches) {
    if (!m.isFinished) continue
    const correctCount = (m.predictions ?? []).filter(p => p.correct === true).length
    events.push({
      id: `result:${m.id}`,
      type: 'result',
      at: m.kickoff,
      matchId: m.id,
      compCode: m.competitionCode,
      teams: `${m.home?.short ?? '?'} – ${m.away?.short ?? '?'}`,
      score: m.score ? `${m.score.home} - ${m.score.away}` : 'MS',
      correctCount,
      kickoff: m.kickoff,
    })
  }

  events.sort((a, b) => Date.parse(b.at ?? 0) - Date.parse(a.at ?? 0))
  return events.slice(0, limit)
}
