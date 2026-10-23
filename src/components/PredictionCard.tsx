import Crest from './Crest'
import CompBadge from './CompBadge'
import uiStore from '../stores/ui-store'
import { fmtFullDate } from '../utils/format'
import { cn } from '../utils/cn'

export default function PredictionCard({ match, pred }: { match: any; pred: any }) {
  return (
    <button class="pred-card" click={() => uiStore.openSheet(match.id)}>
      <div class="pred-card-head">
        <CompBadge code={match.competitionCode} size="sm" />
        <span class="pred-card-date">{fmtFullDate(match.kickoff)}</span>
      </div>
      <div class="pred-card-teams">
        <div class="pred-card-side">
          <Crest name={match.home.name} short={match.home.short} crest={match.home.crest} size={30} />
          <span>{match.home.short}</span>
          <span class="pred-card-score">{match.score ? match.score.home : '–'}</span>
        </div>
        <div class="pred-card-side">
          <Crest name={match.away.name} short={match.away.short} crest={match.away.crest} size={30} />
          <span>{match.away.short}</span>
          <span class="pred-card-score">{match.score ? match.score.away : '–'}</span>
        </div>
      </div>
      <div class="pred-card-foot">
        <span class="pred-card-label">Tahminin: <b>{pred?.label}</b></span>
        {match.isFinished ? (
          <span class={cn('pred-points', pred?.correct ? 'hit' : 'miss')}>{pred?.points ?? 0} P</span>
        ) : (
          <span class="pred-points pending">{match.isLive ? 'CANLI' : 'Bekliyor'}</span>
        )}
      </div>
    </button>
  )
}
