import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import { cn } from '../utils/cn'

export default function StandingsTable() {
  const rows = leagueStore.standings
  if (rows.length === 0) {
    return <div class="empty">Puan tablosu için henüz veri yok.</div>
  }
  return (
    <div class="table-wrap">
      <table class="standings-table">
        <thead>
          <tr>
            <th class="col-rank">#</th>
            <th class="col-player">Oyuncu</th>
            <th class="col-num" title="Oynanan">O</th>
            <th class="col-num" title="Fenerbahçe doğru">FB</th>
            <th class="col-num" title="Galatasaray doğru">GS</th>
            <th class="col-num" title="Beşiktaş doğru">BJK</th>
            <th class="col-num" title="Trabzonspor doğru">TS</th>
            <th class="col-num" title="Puan">P</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any) => (
            <tr class={row.id === uiStore.identityId ? 'own-row' : ''} key={row.id}>
              <td class={cn('col-rank', row.rank <= 3 && 'top')}>{row.rank}</td>
              <td class="col-player">
                <span class="cell-player">
                  <span class="avatar sm" style={{ '--avatar-color': row.color } as any}>{row.initials}</span>
                  <span>{row.name}</span>
                  {row.id === uiStore.identityId ? <span class="you-tag">SEN</span> : null}
                </span>
              </td>
              <td class="col-num">{row.played}</td>
              <td class="col-num team-col">{row.teamCorrect.FB}</td>
              <td class="col-num team-col">{row.teamCorrect.GS}</td>
              <td class="col-num team-col">{row.teamCorrect.BJK}</td>
              <td class="col-num team-col">{row.teamCorrect.TS}</td>
              <td class="col-num points">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
