import Crest from './Crest'
import CompBadge from './CompBadge'
import uiStore from '../stores/ui-store'
import leagueStore from '../stores/league-store'
// DİKKAT: router UYGULAMANIN instance'ı (src/router.ts) — @geajs/core'un
// global singleton'ı değil (URL değişir ama RouterView habersiz kalır).
import { router } from '../router'
import { fmtFullDate, dateKey } from '../utils/format'
import { cn } from '../utils/cn'

// Denetim turu (#31): kart tıklaması eskiden kaldırılmış uiStore.openSheet'i
// çağırıyordu (TypeError). Artık maça GİT: günü seç + filtreleri sıfırla +
// akordiyonu aç + Maçlar sayfasına dön.
export default function PredictionCard({ match, identityId }: { match: any; identityId: string }) {
  const pred = identityId
    ? match.predictions.find((p: any) => p.playerId === identityId)
    : null
  return (
    <button
      class="pred-card"
      title="Maçlar sayfasında göster"
      click={() => {
        uiStore.openMatch(match.id)
        leagueStore.selectDay(dateKey(match.kickoff))
        leagueStore.clearFilters()
        router.push('/')
      }}
    >
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
        <span class="pred-card-label">Tahmini: <b>{pred?.label}</b></span>
        {match.isFinished ? (
          <span class={cn('pred-points', pred?.correct ? 'hit' : 'miss')}>{pred?.points ?? 0} P</span>
        ) : (
          <span class="pred-points pending">{match.isLive ? 'CANLI' : 'Bekliyor'}</span>
        )}
      </div>
    </button>
  )
}
