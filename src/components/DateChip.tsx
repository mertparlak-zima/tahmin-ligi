import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import { fmtDay, fmtMonth, fmtWeekday } from '../utils/format'
import { cn } from '../utils/cn'

const POPOVER_WIDTH = 260

/** Popover'ı chip'in üstüne (yer yoksa altına), viewport içine sıkıştırarak konumla.
 *  Olay anında imperatif uygulanır — reaktif attr binding'inin ezilme riski yok. */
function positionPopover(rect: DOMRect) {
  const el = document.querySelector('.date-preview-popover') as HTMLElement | null
  if (!el) return
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - POPOVER_WIDTH / 2, 10),
    Math.max(window.innerWidth - POPOVER_WIDTH - 10, 10)
  )
  const top = rect.top < 220 ? rect.bottom : rect.top
  el.style.width = `${POPOVER_WIDTH}px`
  el.style.left = `${Math.round(left)}px`
  el.style.top = `${Math.round(top)}px`
}

export default function DateChip({ chip, selected, onSelect }: {
  chip: { key: string; count: number; hasLive: boolean; isToday: boolean }
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      class={cn('date-chip', selected && 'selected')}
      click={() => {
        onSelect()
        uiStore.closeDatePreview()
      }}
      mouseover={(e: any) => {
        // Önizleme yalnız gerçek hover cihazlarında (masaüstü); dokunmatikte yok.
        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
        const target = e.target.closest?.('.date-chip')
        if (!target) return
        if ((leagueStore.matchesByDay[chip.key] ?? []).length === 0) return
        const rect = target.getBoundingClientRect()
        uiStore.openDatePreview(chip.key, rect)
        positionPopover(rect)
      }}
      mouseout={(e: any) => {
        const from = e.target.closest?.('.date-chip')
        const to = e.relatedTarget?.closest?.('.date-chip')
        if (from && to === from) return
        uiStore.closeDatePreview()
      }}
    >
      <span class="date-weekday">{fmtWeekday(chip.key)}</span>
      <span class="date-day">{fmtDay(chip.key)}</span>
      <span class="date-month">{fmtMonth(chip.key)}</span>
      {chip.hasLive ? <span class="date-live-dot"></span> : null}
      {chip.count > 0 && !chip.hasLive ? <span class="date-count">{chip.count}</span> : null}
    </button>
  )
}
