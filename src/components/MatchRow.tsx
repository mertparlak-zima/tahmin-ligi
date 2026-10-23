import Crest from './Crest'
import CompBadge from './CompBadge'
import uiStore from '../stores/ui-store'
import { fmtTime } from '../utils/format'
import { cn } from '../utils/cn'

export default function MatchRow({ match }: { match: any }) {
  const homeScore = match.score?.home ?? null
  const awayScore = match.score?.away ?? null
  const dimHome = match.isFinished && homeScore !== null && awayScore !== null && homeScore < awayScore
  const dimAway = match.isFinished && homeScore !== null && awayScore !== null && homeScore > awayScore

  const slot =
    match.statusGroup === 'inactive'
      ? { cls: 'inactive', main: 'ERT.', sub: match.status === 'CANCELLED' ? 'İPTAL' : '—' }
      : match.isLive
        ? { cls: 'live', main: match.minute ? `${match.minute}'` : '•', sub: 'CANLI' }
        : match.isFinished
          ? { cls: 'finished', main: 'MS', sub: 'BİTTİ' }
          : { cls: 'upcoming', main: fmtTime(match.kickoff), sub: '' }

  return (
    <button class={cn('match-row', match.isLive && 'is-live')} click={() => uiStore.openSheet(match.id)}>
      <div class={cn('slot', slot.cls)}>
        <span class="slot-main">{slot.main}</span>
        {slot.sub ? <span class="slot-sub">{slot.sub}</span> : null}
      </div>
      <div class="match-teams">
        <div class={cn('team-line', dimHome && 'dim')}>
          <Crest name={match.home.name} short={match.home.short} crest={match.home.crest} size={22} />
          <span class="team-name">{match.home.short}</span>
          <span class="team-score">{homeScore ?? '–'}</span>
        </div>
        <div class={cn('team-line', dimAway && 'dim')}>
          <Crest name={match.away.name} short={match.away.short} crest={match.away.crest} size={22} />
          <span class="team-name">{match.away.short}</span>
          <span class="team-score">{awayScore ?? '–'}</span>
        </div>
      </div>
      <div class="match-meta">
        <CompBadge code={match.competitionCode} size="sm" />
        {match.predictionCount > 0 ? (
          <span class="pred-count">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {match.predictionCount}
          </span>
        ) : null}
      </div>
      <span class="row-chevron" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  )
}
