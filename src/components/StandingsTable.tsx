import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import StandingsRow from './StandingsRow'

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
          {rows.map(row => (
            <StandingsRow key={row.id} row={row} isOwn={row.id === uiStore.identityId} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
