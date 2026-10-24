import { Component } from '@geajs/core'
import adminStore from '../../stores/admin-store'
import EditorDay from './EditorDay'
import Avatar from '../../components/Avatar'
import { cn } from '../../utils/cn'

// Oyuncu filtre çipi (#20 U4): keyed map öğesi ham element olamaz (AGENTS
// kural 6) → bileşen. Aktiflik YALNIZCA store erişiminden okunur (kural 9).
class PlayerChip extends Component {
  template({ player }: any) {
    return (
      <button
        class={cn('acc-chip', adminStore.playerFilter === player.id && 'on')}
        aria-pressed={adminStore.playerFilter === player.id ? 'true' : 'false'}
        click={() => adminStore.togglePlayerFilter(player.id)}
      >
        <Avatar
          color={player.color}
          initials={player.initials}
          photo={player.avatarUrl ?? null}
          size="sm"
          title={player.name}
        />
        <span class="acc-chip-name">{player.name}</span>
      </button>
    )
  }
}

export default class PredictionsTab extends Component {
  template() {
    const openCount = adminStore.openMatchCount

    return (
      <div class="admin-preds">
        <div class="acc-filter" role="group" aria-label="Oyuncu filtresi">
          <button
            class={cn('acc-chip', adminStore.playerFilter === '' && 'on')}
            aria-pressed={adminStore.playerFilter === '' ? 'true' : 'false'}
            click={() => adminStore.clearPlayerFilter()}
          >
            Tümü
          </button>
          {adminStore.activePlayers.map(player => (
            <PlayerChip key={player.id} player={player} />
          ))}
        </div>

        <div class="admin-toolbar">
          <button class="btn ghost sm" click={() => adminStore.toggleLocked()}>
            {adminStore.showLocked
              ? '🔒 Geçmiş maçları gizle'
              : `🔒 Geçmiş maçları göster (${adminStore.lockedMatchCount})`}
          </button>
        </div>

        <div class="admin-hint">
          <b>{openCount} tahmine açık maç</b> — satırı aç, oyuncu seçimlerini yap ve o maç için
          Kaydet'e bas. Tahminler maç başlama saatinde otomatik kilitlenir; bitmiş maçlar
          değiştirilemez.
        </div>

        {adminStore.activePlayerCount === 0 ? (
          <div class="empty">Önce Oyuncular sekmesinden oyuncu ekle veya aktifleştir.</div>
        ) : adminStore.editorDays.length === 0 ? (
          <div class="empty">Tahmine açık maç yok.</div>
        ) : (
          adminStore.editorDays.map(dayGroup => (
            <EditorDay key={dayGroup.day} day={dayGroup.day} matches={dayGroup.matches} />
          ))
        )}

        {adminStore.showLocked && adminStore.lockedDays.length > 0 ? (
          <div>
            <div class="locked-section-title">Geçmiş · kilitli maçlar (değiştirilemez)</div>
            {adminStore.lockedDays.map(dayGroup => (
              <EditorDay key={dayGroup.day} day={dayGroup.day} matches={dayGroup.matches} locked />
            ))}
          </div>
        ) : null}
      </div>
    )
  }
}
