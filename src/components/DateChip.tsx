import { fmtDay, fmtMonth, fmtWeekday } from '../utils/format'
import { cn } from '../utils/cn'

export default function DateChip({ chip, selected, onSelect }: {
  chip: { key: string; count: number; hasLive: boolean; isToday: boolean }
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button class={cn('date-chip', selected && 'selected')} click={onSelect}>
      <span class="date-weekday">{fmtWeekday(chip.key)}</span>
      <span class="date-day">{fmtDay(chip.key)}</span>
      <span class="date-month">{fmtMonth(chip.key)}</span>
      {chip.hasLive ? <span class="date-live-dot"></span> : null}
      {chip.count > 0 && !chip.hasLive ? <span class="date-count">{chip.count}</span> : null}
    </button>
  )
}
