import { Component } from '@geajs/core'
import adminStore from '../../stores/admin-store'
import EditorDay from './EditorDay'
import CompOption from '../../components/CompOption'

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
          <button class="btn ghost sm" click={() => adminStore.toggleLocked()}>
            {adminStore.showLocked
              ? '🔒 Geçmiş maçları gizle'
              : `🔒 Geçmiş maçları göster (${adminStore.lockedMatchCount})`}
          </button>
        </div>

        <div class="admin-hint">
          <b>{openCount} tahmine açık maç</b> — yalnızca bu maçlardaki seçimler kaydedilebilir.
          Tahminler maç başlama saatinde otomatik kilitlenir; bitmiş maçlar değiştirilemez.
        </div>

        {players.length === 0 ? (
          <div class="empty">Önce Oyuncular sekmesinden oyuncu ekle.</div>
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
