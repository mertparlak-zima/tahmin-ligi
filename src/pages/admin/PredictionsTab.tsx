import { Component } from '@geajs/core'
import adminStore from '../../stores/admin-store'
import { fmtTime, dateKey, relativeDayLabel } from '../../utils/format'
import { cn } from '../../utils/cn'

export default class PredictionsTab extends Component {
  template() {
    const matches = adminStore.editorMatches
    const players: any[] = adminStore.data?.players ?? []
    const openCount = (adminStore.data?.matches ?? []).filter((m: any) => !m.locked).length

    const byDay = new Map<string, any[]>()
    for (const match of matches) {
      const key = dateKey(match.kickoff)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(match)
    }

    return (
      <div class="admin-preds">
        <div class="admin-toolbar">
          <select class="comp-select" aria-label="Oyuncu" change={e => adminStore.setEditorPlayer((e.target as HTMLSelectElement).value)}>
            {players.map((p: any) => (
              <option value={p.id} selected={adminStore.editorPlayerId === p.id}>
                {p.name}{p.isActive ? '' : ' (pasif)'}
              </option>
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

        {players.length === 0 ? (
          <div class="empty">Önce Oyuncular sekmesinden oyuncu ekle.</div>
        ) : byDay.size === 0 ? (
          <div class="empty">Tahmine açık maç yok.</div>
        ) : (
          [...byDay.entries()].map(([day, dayMatches]) => (
            <section class="admin-day" key={day}>
              <header class="admin-day-head">
                {relativeDayLabel(day)} · {dayMatches.length} maç
              </header>
              {dayMatches.map(match => {
                const draft = adminStore.drafts[match.id] ?? ''
                const baseline = adminStore.baseline[match.id] ?? ''
                const dirty = draft !== baseline
                return (
                  <div class={cn('editor-row', match.locked && 'locked', dirty && 'dirty')} key={match.id}>
                    <span class="editor-time">{fmtTime(match.kickoff)}</span>
                    <span class="editor-comp">{match.competitionCode}</span>
                    <span class="editor-teams">
                      {match.homeShort} – {match.awayShort}
                    </span>
                    <span class="editor-status">{statusText(match)}</span>
                    <select
                      class="editor-select"
                      disabled={match.locked}
                      value={draft}
                      change={e => adminStore.setDraft(match.id, (e.target as HTMLSelectElement).value)}
                    >
                      <option value="" selected={draft === ''}>—</option>
                      <option value="H" selected={draft === 'H'}>{match.homeShort} yener</option>
                      <option value="D" selected={draft === 'D'}>Beraberlik</option>
                      <option value="A" selected={draft === 'A'}>{match.awayShort} yener</option>
                    </select>
                  </div>
                )
              })}
            </section>
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

function statusText(match: any): string {
  if (match.statusGroup === 'inactive') return match.status === 'CANCELLED' ? 'İptal' : 'Ertelendi'
  if (match.locked && match.score) return `MS ${match.score.home}-${match.score.away}`
  if (match.locked) return 'Kilitli'
  return 'Yaklaşan'
}
