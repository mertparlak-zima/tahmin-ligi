import { Component } from '@geajs/core'
import adminStore from '../../stores/admin-store'

export default class ScoringTab extends Component {
  template() {
    const form = adminStore.scoringForm
    return (
      <div class="admin-scoring">
        <div class="field">
          <label class="field-label" for="scoring-label">Etiket</label>
          <input
            id="scoring-label"
            class="input"
            type="text"
            maxlength="80"
            value={form.label}
            input={e => (adminStore.scoringForm.label = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="field">
          <label class="field-label" for="scoring-status">Durum</label>
          <select
            id="scoring-status"
            class="comp-select"
            value={form.status}
            change={e => (adminStore.scoringForm.status = (e.target as HTMLSelectElement).value)}
          >
            <option value="provisional" selected={form.status === 'provisional'}>Geçici</option>
            <option value="final" selected={form.status === 'final'}>Kesinleşti</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="scoring-points">Doğru sonuç puanı</label>
          <input
            id="scoring-points"
            class="input narrow"
            type="number"
            min="0"
            max="100"
            value={form.correctOutcome}
            input={e => (adminStore.scoringForm.correctOutcome = Number((e.target as HTMLInputElement).value || 0))}
          />
          <span class="field-hint">Puanlar her istekte bu kurala göre yeniden hesaplanır.</span>
        </div>
        <button class="btn primary" click={() => adminStore.saveScoring()}>Kaydet</button>
      </div>
    )
  }
}
