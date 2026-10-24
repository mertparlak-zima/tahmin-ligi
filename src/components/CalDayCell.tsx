// Takvim gün hücresi (#19): gün sayısı + fikstür chipleri; hover'da gün
// önizlemesi (#11 DatePreviewPopover, uiStore.openDatePreview ile aynı API);
// tıklama günü seçer (alttaki maç listesi o güne döner).

import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import CalChip from './CalChip'
import { todayDayKey } from '../utils/calendar.js'
import { cn } from '../utils/cn'

export default function CalDayCell({ cell }: { cell: { cellId: string; dayKey: string; day: number; inMonth: boolean } }) {
  const summary = leagueStore.calendarSummaries[cell.dayKey] ?? { chips: [], overflow: 0, hasLive: false }
  const isToday = cell.dayKey === todayDayKey()
  const selected = leagueStore.selectedDate === cell.dayKey

  return (
    <button
      class={cn(
        'cal-cell',
        cell.inMonth && 'in-month',
        isToday && 'today',
        selected && 'selected',
        summary.hasLive && 'has-live'
      )}
      aria-label={cell.dayKey}
      click={() => {
        leagueStore.selectDay(cell.dayKey)
        uiStore.closeDatePreview()
      }}
      mouseover={(e: any) => {
        // Önizleme yalnız gerçek hover cihazlarında (#11 ile aynı karar).
        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
        const target = e.target.closest?.('.cal-cell')
        if (!target) return
        if ((leagueStore.calendarMatchesByDay[cell.dayKey] ?? []).length === 0) return
        uiStore.openDatePreview(cell.dayKey, target.getBoundingClientRect())
      }}
      mouseout={(e: any) => {
        const from = e.target.closest?.('.cal-cell')
        const to = e.relatedTarget?.closest?.('.cal-cell')
        if (from && to === from) return
        uiStore.closeDatePreview()
      }}
    >
      <span class="cal-watermark" aria-hidden="true">{cell.day}</span>
      {summary.hasLive ? <span class="cal-live-dot" aria-hidden="true"></span> : null}
      {summary.chips.map((chip: any) => <CalChip key={chip.id} chip={chip} />)}
      {summary.overflow > 0 ? <span class="cal-overflow">+{summary.overflow}</span> : null}
    </button>
  )
}
