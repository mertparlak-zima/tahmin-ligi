// Takvim fikstür çipi (#19 + #20 eki): "FB–ROM 2-1" — turnuva rengi sol kenarda,
// ton canlı/bitti/yaklaşan/ertelendi; bayatlık anında canlı değer dürüstçe
// "SON" önekiyle etiketlenir (#18 politikası). Bitmiş maçta kazanan takım
// kısaltması yeşil, kaybeden kırmızı, beraberlikte ikisi de gridir.

import leagueStore from '../stores/league-store'
import { cn } from '../utils/cn'

export default function CalChip({ chip }: { chip: any }) {
  const staleLive = chip.tone === 'live' && leagueStore.staleActive
  const hasOutcome = chip.tone === 'finished' && chip.outcome && chip.homeAbbr && chip.awayAbbr
  // outcome: 'H' ev kazanır, 'A' deplasman kazanır, 'D' beraberlik.
  const homeCls = hasOutcome
    ? chip.outcome === 'H' ? 'win' : chip.outcome === 'A' ? 'loss' : 'draw'
    : ''
  const awayCls = hasOutcome
    ? chip.outcome === 'A' ? 'win' : chip.outcome === 'H' ? 'loss' : 'draw'
    : ''
  return (
    <span
      class={cn('cal-chip', staleLive && 'stale')}
      data-tone={chip.tone}
      data-comp={chip.compCode}
      title={chip.title}
    >
      <span class="cal-chip-label">
        {hasOutcome ? (
          <span>
            <span class={cn('cal-team', homeCls)}>{chip.homeAbbr}</span>
            <span class="cal-chip-dash">–</span>
            <span class={cn('cal-team', awayCls)}>{chip.awayAbbr}</span>
          </span>
        ) : (
          chip.label
        )}
      </span>
      <span class="cal-chip-val">{staleLive ? `SON ${chip.text}` : chip.text}</span>
    </span>
  )
}
