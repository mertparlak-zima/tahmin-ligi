import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import MatchRow from '../components/MatchRow'
import { fmtTime, relativeDayLabel } from '../utils/format'
import { dateKey } from '../utils/format'

export default function ResultsPage() {
  const finished = [...leagueStore.finishedMatches].sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff))
  const identity = uiStore.identity

  if (finished.length === 0) {
    return (
      <div class="empty big">
        <div class="empty-title">Biten maç yok</div>
        <div class="empty-sub">Sonuçlar maçlar tamamlandıkça burada birikir.</div>
      </div>
    )
  }

  const byDay = new Map<string, any[]>()
  for (const match of finished) {
    const key = dateKey(match.kickoff)
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(match)
  }

  return (
    <div class="results-page">
      <div class="page-meta">
        <span class="meta-main">{finished.length} biten maç</span>
        {identity ? <span class="meta-side">{identity.name} puanları gösteriliyor</span> : null}
      </div>
      {[...byDay.entries()].map(([day, matches]) => (
        <section class="day-group" key={day}>
          <header class="day-group-head">
            {relativeDayLabel(day)} · {matches.length} maç
          </header>
          <div class="match-list">
            {matches.map(match => {
              const pred = identity
                ? match.predictions.find((p: any) => p.playerId === identity.id)
                : null
              let badge = null
              if (pred) {
                if (pred.points === null || pred.points === undefined) {
                  badge = <span class="result-points pending">Bekliyor</span>
                } else {
                  badge = (
                    <span class={pred.correct ? 'result-points hit' : 'result-points miss'}>
                      {pred.points} P
                    </span>
                  )
                }
              } else if (identity) {
                badge = <span class="result-points none">Tahmin yok</span>
              }
              return (
                <div class="result-item" key={match.id}>
                  <button class="result-match" click={() => uiStore.openSheet(match.id)}>
                    <span class="result-teams">
                      {match.home.short} <b class="result-score">{match.score.home} – {match.score.away}</b> {match.away.short}
                    </span>
                    <span class="result-meta">{fmtTime(match.kickoff)} · {match.competitionCode}</span>
                  </button>
                  {badge}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
