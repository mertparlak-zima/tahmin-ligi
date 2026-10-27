import leagueStore from '../stores/league-store'
import StandingsRow from './StandingsRow'

export default function StandingsTable({ standings }: { standings: any[] }) {
  if (standings.length === 0) {
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
            {/* #21: TSL sütun seti — FB/GS/BJK/TS yerine İsabet %. Koşullar
                doğrudan store okumasıyla (Gea kural 10/11: prop'a bağlı
                element koşulları güvenilmez). */}
            {leagueStore.league === 'TSL' ? <th class="col-num" title="İsabet yüzdesi">İsabet %</th> : null}
            {leagueStore.league !== 'TSL' ? <th class="col-num" title="Fenerbahçe doğru">FB</th> : null}
            {leagueStore.league !== 'TSL' ? <th class="col-num" title="Galatasaray doğru">GS</th> : null}
            {leagueStore.league !== 'TSL' ? <th class="col-num" title="Beşiktaş doğru">BJK</th> : null}
            {leagueStore.league !== 'TSL' ? <th class="col-num" title="Trabzonspor doğru">TS</th> : null}
            <th class="col-num" title="Puan">P</th>
          </tr>
        </thead>
        <tbody>
          {standings.map(row => (
            <StandingsRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
