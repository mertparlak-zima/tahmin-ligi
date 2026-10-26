import leagueStore from '../stores/league-store'
import Avatar from './Avatar'
import { cn } from '../utils/cn'

export default function StandingsRow({ row, isOwn }: { row: any; isOwn: boolean }) {
  return (
    <tr class={isOwn ? 'own-row' : ''}>
      <td class={cn('col-rank', row.rank <= 3 && 'top')}>{row.rank}</td>
      <td class="col-player">
        <span class="cell-player">
          <Avatar color={row.color} initials={row.initials} size="sm" photo={row.avatarUrl ?? null} />
          <span>{row.name}</span>
          {isOwn ? <span class="you-tag">SEN</span> : null}
        </span>
      </td>
      <td class="col-num">{row.played}</td>
      {/* #21: TSL satırı — takım sütunları yerine isabet yüzdesi. Koşullar
          doğrudan store okumasıyla; hücre içeriği prop'tan metin olarak
          tüketilir (ikisi de kanıtlanmış güvenli desen). */}
      {leagueStore.league === 'TSL' ? <td class="col-num acc-col">%{row.accuracy ?? 0}</td> : null}
      {leagueStore.league !== 'TSL' ? <td class="col-num team-col">{row.teamCorrect.FB}</td> : null}
      {leagueStore.league !== 'TSL' ? <td class="col-num team-col">{row.teamCorrect.GS}</td> : null}
      {leagueStore.league !== 'TSL' ? <td class="col-num team-col">{row.teamCorrect.BJK}</td> : null}
      {leagueStore.league !== 'TSL' ? <td class="col-num team-col">{row.teamCorrect.TS}</td> : null}
      <td class="col-num points">{row.points}</td>
    </tr>
  )
}
