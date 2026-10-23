import adminStore from '../../stores/admin-store'
import { fmtTime } from '../../utils/format'

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return fmtTime(iso)
}

export default function DataTab() {
  const sync = adminStore.data?.sync
  return (
    <div class="admin-data">
      <div class="data-grid">
        <div class="data-item">
          <span class="data-label">Sağlayıcı</span>
          <span class="data-value">ESPN (CL · EL · UECL)</span>
        </div>
        <div class="data-item">
          <span class="data-label">Son deneme</span>
          <span class="data-value">{fmt(sync?.last_attempt_at)}</span>
        </div>
        <div class="data-item">
          <span class="data-label">Son başarılı</span>
          <span class="data-value">{fmt(sync?.last_success_at)}</span>
        </div>
        <div class="data-item">
          <span class="data-label">Görülen maç</span>
          <span class="data-value">{sync?.matches_seen ?? 0}</span>
        </div>
      </div>
      {sync?.last_error ? (
        <div class="error-box">{sync.last_error}</div>
      ) : null}
      <button class="btn primary" disabled={adminStore.syncRunning} click={() => adminStore.syncNow()}>
        {adminStore.syncRunning ? 'Senkronize ediliyor…' : 'Şimdi senkronize et'}
      </button>
      <div class="admin-hint">
        Site zaten veri bayatladıkça otomatik senkronize olur; bu düğme anında güncellemek için.
      </div>
    </div>
  )
}
