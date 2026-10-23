import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import PodiumCard from './PodiumCard'

export default class Podium extends Component {
  template() {
    const has = leagueStore.podiumOrder.length > 0
    return (
      <div class={`podium${has ? ' has' : ''}`}>
        {leagueStore.podiumOrder.map(row => <PodiumCard key={row.id} row={row} />)}
      </div>
    )
  }
}
