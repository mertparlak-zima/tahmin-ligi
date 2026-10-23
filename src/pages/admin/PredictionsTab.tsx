import { Component } from '@geajs/core'
import adminStore from '../../stores/admin-store'
import EditorDay from './EditorDay'
import CompOption from '../../components/CompOption'
import { cn } from '../../utils/cn'

export default class PredictionsTab extends Component {
  template() {
    const players: any[] = adminStore.players
    const openCount = adminStore.openMatchCount

    return (
      <div class="admin-preds">
        <div class="admin-toolbar">
          <select
            class="comp-select"
            aria-label="Oyuncu"
            value={adminStore.editorPlayerId}
            change={e => adminStore.setEditorPlayer((e.target as HTMLSelectElement).value)}
          >
            {players.map((p: any) => (
              <CompOption
                key={p.id}
                value={p.id}
                label={p.isActive ? p.name : `${p.name} (pasif)`}
              />
            ))}
          </select>
          <div class="segmented">
            <button class={cn('seg-item', adminStore.editorFilter === 'open' && 'active')} click={() => adminStore.setEditorFilter('open')}>
              Tahmine açık ({openCount})
            </button>
            <button class={cn('seg-item', adminStore.editorFilter === 'all' && 'active')} click={() => adminStore.setEditorFilter('all')}>
              Tüm maçlar
            </button>
          </div>
        </div>

        <div class="admin-hint">
          Tahminler maç başlama saatinde otomatik kilitlenir. Kilitli maçlar gri görünür ve değiştirilemez.
        </div>

        {adminStore.players.length === 0 ? (
          <div class="empty">Önce Oyuncular sekmesinden oyuncu ekle.</div>
        ) : adminStore.editorDays.length === 0 ? (
          <div class="empty">Tahmine açık maç yok.</div>
        ) : (
          adminStore.editorDays.map(g => (
            <EditorDay key={g.day} day={g.day} matches={g.matches} />
          ))
        )}

        {adminStore.dirtyCount > 0 ? (
          <div class="save-bar">
            <span>{adminStore.dirtyCount} maçta kaydedilmemiş değişiklik</span>
            <button class="btn primary sm" disabled={adminStore.saving} click={() => adminStore.savePredictions()}>
              {adminStore.saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        ) : null}
      </div>
    )
  }
}
