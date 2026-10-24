import { Component } from '@geajs/core'
import PodiumCard from './PodiumCard'

export default class Podium extends Component {
  template({ standings }: any) {
    const top3 = (standings ?? []).slice(0, 3)
    const order = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3
    const has = order.length > 0
    return (
      <div class={`podium${has ? ' has' : ''}`}>
        {order.map(row => <PodiumCard key={row.id} row={row} />)}
      </div>
    )
  }
}
