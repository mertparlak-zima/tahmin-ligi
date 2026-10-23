import { Component } from '@geajs/core'
import adminStore from '../../stores/admin-store'
import PlayerRow from './PlayerRow'

export default class PlayersTab extends Component {
  newName = ''
  newColor = '#b8f34a'

  template() {
    const players: any[] = adminStore.data?.players ?? []
    return (
      <div class="admin-players">
        <form
          class="player-form"
          submit={e => {
            e.preventDefault()
            const name = this.newName.trim()
            if (name.length >= 2) {
              adminStore.addPlayer(name, this.newColor).then(() => (this.newName = ''))
            }
          }}
        >
          <input
            class="input"
            type="text"
            placeholder="Yeni oyuncu adı"
            maxlength="40"
            value={this.newName}
            input={e => (this.newName = (e.target as HTMLInputElement).value)}
          />
          <input
            class="color-input"
            type="color"
            aria-label="Oyuncu rengi"
            value={this.newColor}
            input={e => (this.newColor = (e.target as HTMLInputElement).value)}
          />
          <button class="btn primary sm" type="submit" disabled={this.newName.trim().length < 2}>
            Ekle
          </button>
        </form>

        <div class="player-list">
          {players.map(p => <PlayerRow key={p.id} player={p} />)}
          {players.length === 0 ? <div class="empty">Henüz oyuncu yok.</div> : null}
        </div>
      </div>
    )
  }
}
