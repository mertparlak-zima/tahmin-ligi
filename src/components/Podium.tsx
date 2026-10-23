import leagueStore from '../stores/league-store'
import { cn } from '../utils/cn'

export default function Podium() {
  const top3 = leagueStore.standings.slice(0, 3)
  if (top3.length === 0) return null
  const order = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3
  return (
    <div class="podium">
      {order.map((row: any) => (
        <div class={cn('podium-card', `place-${row.rank}`)} key={row.id}>
          {row.rank === 1 ? (
            <span class="podium-trophy">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
                <path d="M7 6H4a1 1 0 0 0-1 1c0 2.2 1.8 4 4 4M17 6h3a1 1 0 0 1 1 1c0 2.2-1.8 4-4 4" />
              </svg>
            </span>
          ) : null}
          <span class="avatar lg" style={{ '--avatar-color': row.color } as any}>{row.initials}</span>
          <span class="podium-rank">{row.rank}. sıra</span>
          <span class="podium-name">{row.name}</span>
          <span class="podium-points">{row.points} P</span>
          <span class="podium-sub">{row.correctOutcomes} doğru · {row.played} maç</span>
        </div>
      ))}
    </div>
  )
}
