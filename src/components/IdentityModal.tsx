import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import IdentityChip from './IdentityChip'

export default class IdentityModal extends Component {
  template() {
    const players: any[] = leagueStore.data?.players ?? []
    const open = uiStore.identityModalOpen
    return (
      <div class={`modal-root${open ? ' open' : ''}`}>
        {open ? (
          <div>
            <div class="modal-backdrop" click={() => uiStore.closeIdentityModal()}></div>
            <div class="modal" role="dialog" aria-modal="true" aria-label="Oyuncu seç">
              <div class="modal-title">Kimsin?</div>
              <div class="modal-sub">Tahmin karneni görmek için adını seç.</div>
              <div class="identity-grid">
                {players.map(p => (
                  <IdentityChip
                    key={p.id}
                    player={p}
                    selected={uiStore.identityId === p.id}
                    onSelect={() => {
                      uiStore.setIdentity(p.id)
                      uiStore.toast(`«${p.name}» olarak görüntülüyorsun.`)
                    }}
                  />
                ))}
                {players.length === 0 ? <div class="modal-sub">Henüz oyuncu eklenmemiş.</div> : null}
              </div>
              <button class="btn ghost sm" click={() => uiStore.closeIdentityModal()}>Vazgeç</button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }
}
