// Takvim fikstür çipi (#19): "FB–ROM 2-1" — turnuva rengi sol kenarda,
// ton canlı/bitti/yaklaşan/ertelendi; bayatlık anında canlı değer dürüstçe
// "SON" önekiyle etiketlenir (#18 politikası).

import leagueStore from '../stores/league-store'
import { cn } from '../utils/cn'

export default function CalChip({ chip }: { chip: any }) {
  const staleLive = chip.tone === 'live' && leagueStore.staleActive
  return (
    <span
      class={cn('cal-chip', staleLive && 'stale')}
      data-tone={chip.tone}
      data-comp={chip.compCode}
      title={chip.title}
    >
      <span class="cal-chip-label">{chip.label}</span>
      <span class="cal-chip-val">{staleLive ? `SON ${chip.text}` : chip.text}</span>
    </span>
  )
}
