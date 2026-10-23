import uiStore from '../stores/ui-store'
import { fmtTime } from '../utils/format'

export default function ResultItem({ match, identityId }: { match: any; identityId: string }) {
  const pred = identityId
    ? match.predictions.find((p: any) => p.playerId === identityId)
    : null
  return (
    <div class="result-item">
      <button class="result-match" click={() => uiStore.openSheet(match.id)}>
        <span class="result-teams">
          {match.home.short} <b class="result-score">{match.score.home} – {match.score.away}</b> {match.away.short}
        </span>
        <span class="result-meta">{fmtTime(match.kickoff)} · {match.competitionCode}</span>
      </button>
      {identityId ? (
        pred ? (
          pred.points === null || pred.points === undefined ? (
            <span class="result-points pending">Bekliyor</span>
          ) : (
            <span class={pred.correct ? 'result-points hit' : 'result-points miss'}>
              {pred.points} P
            </span>
          )
        ) : (
          <span class="result-points none">Tahmin yok</span>
        )
      ) : null}
    </div>
  )
}
