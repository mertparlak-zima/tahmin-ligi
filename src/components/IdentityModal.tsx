import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'

export default function IdentityModal() {
  if (!uiStore.identityModalOpen) return null
  const players: any[] = leagueStore.data?.players ?? []
  return (
    <div class="modal-root">
      <div class="modal-backdrop" click={() => uiStore.closeIdentityModal()}></div>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Oyuncu seç">
        <div class="modal-title">Kimsin?</div>
        <div class="modal-sub">Tahmin karneni görmek için adını seç.</div>
        <div class="identity-grid">
          {players.map(p => (
            <button
              class={uiStore.identityId === p.id ? 'identity-chip selected' : 'identity-chip'}
              key={p.id}
              click={() => {
                uiStore.setIdentity(p.id)
                uiStore.toast(`«${p.name}» olarak görüntülüyorsun.`)
              }}
            >
              <span class="avatar" style={{ '--avatar-color': p.color } as any}>{p.initials}</span>
              <span class="identity-name">{p.name}</span>
            </button>
          ))}
          {players.length === 0 ? <div class="modal-sub">Henüz oyuncu eklenmemiş.</div> : null}
        </div>
        <button class="btn ghost sm" click={() => uiStore.closeIdentityModal()}>Vazgeç</button>
      </div>
    </div>
  )
}
