// #21 Faz 3: İsabet Şampiyonası tablosu — iki ligin isabet yüzdeleri
// birleşik (sıralama league-store accuracyChampionship getter'ında).
// Default export CLASS component + prop'SUZ (yanında local JSX class bulunan
// dosyada function default export sessiz boş render verdi — kanıtlandı) ve
// liste/boşluk koşulu doğrudan store getter'ından okunur (Gea kuralı 7;
// prop ile taşımak ertelenmiş değerlendirmede patladı).

import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import Avatar from './Avatar'

const EMPTY_STATS = { played: 0, correct: 0, accuracy: 0 }

function pct(stats: any): string {
  const s = stats ?? EMPTY_STATS
  return s.played > 0 ? `%${s.accuracy}` : '—'
}

class AccuracyRow extends Component {
  template({ row }: any) {
    return (
      <tr>
        <td class={row.rank <= 3 ? 'col-rank top' : 'col-rank'}>{row.rank}</td>
        <td class="col-player">
          <span class="cell-player">
            <Avatar color={row.color} initials={row.initials} size="sm" photo={row.avatarUrl ?? null} />
            <span>{row.name}</span>
          </span>
        </td>
        <td class="col-num acc-col">{pct(row.stats.EU)}</td>
        <td class="col-num acc-col">{pct(row.stats.TSL)}</td>
        <td class="col-num points">%{row.general}</td>
      </tr>
    )
  }
}

export default class AccuracyTable extends Component {
  template() {
    return (
      <div class="table-wrap">
        {leagueStore.accuracyChampionship.length === 0 ? (
          <div class="empty">İsabet Şampiyonası için henüz veri yok.</div>
        ) : (
          <table class="standings-table accuracy-table">
            <thead>
              <tr>
                <th class="col-rank">#</th>
                <th class="col-player">Oyuncu</th>
                <th class="col-num" title="Avrupa ligi isabet yüzdesi">EU %</th>
                <th class="col-num" title="Süper Lig isabet yüzdesi">TSL %</th>
                <th class="col-num" title="Genel isabet yüzdesi">Genel %</th>
              </tr>
            </thead>
            <tbody>
              {leagueStore.accuracyChampionship.map(row => (
                <AccuracyRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }
}
