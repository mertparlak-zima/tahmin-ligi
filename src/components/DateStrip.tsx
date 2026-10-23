import leagueStore from '../stores/league-store'
import { fmtDay, fmtMonth, fmtWeekday } from '../utils/format'
import { cn } from '../utils/cn'

export default function DateStrip() {
  const dates = leagueStore.dateList
  return (
    <div class="date-strip" role="tablist" aria-label="Maç günleri">
      {dates.map(d => (
        <button
          class={cn('date-chip', leagueStore.selectedDate === d.key && 'selected')}
          key={d.key}
          click={() => (leagueStore.selectedDate = d.key)}
          aria-current={leagueStore.selectedDate === d.key ? 'date' : null}
        >
          <span class="date-weekday">{fmtWeekday(d.key)}</span>
          <span class="date-day">{fmtDay(d.key)}</span>
          <span class="date-month">{fmtMonth(d.key)}</span>
          {d.hasLive ? <span class="date-live-dot"></span> : null}
          {d.count > 0 && !d.hasLive ? <span class="date-count">{d.count}</span> : null}
        </button>
      ))}
    </div>
  )
}
