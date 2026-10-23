import Avatar from './Avatar'
import { cn } from '../utils/cn'

export default function StandingsRow({ row, isOwn }: { row: any; isOwn: boolean }) {
  return (
    <tr class={isOwn ? 'own-row' : ''}>
      <td class={cn('col-rank', row.rank <= 3 && 'top')}>{row.rank}</td>
      <td class="col-player">
        <span class="cell-player">
          <Avatar color={row.color} initials={row.initials} size="sm" />
          <span>{row.name}</span>
          {isOwn ? <span class="you-tag">SEN</span> : null}
        </span>
      </td>
      <td class="col-num">{row.played}</td>
      <td class="col-num team-col">{row.teamCorrect.FB}</td>
      <td class="col-num team-col">{row.teamCorrect.GS}</td>
      <td class="col-num team-col">{row.teamCorrect.BJK}</td>
      <td class="col-num team-col">{row.teamCorrect.TS}</td>
      <td class="col-num points">{row.points}</td>
    </tr>
  )
}
