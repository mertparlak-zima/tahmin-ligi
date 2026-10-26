// Veri sekmesi: senkronizasyon durumu + manuel senkron.
// #21 Faz 3: manuel senkron yanıtı lig bazlı `leagues` detayı taşır — satır
// satır listelenir. Dosya default export'u CLASS component (yanında local
// JSX class bulunan dosyada function default export sessiz boş render
// veriyor — AGENTS kural 2'nin function-component varyantı, kanıtlandı);
// keyed liste doğrudan store getter'ından map'lenir (kural 7).
import { Component } from '@geajs/core'
import adminStore from '../../stores/admin-store'
import { fmtTime } from '../../utils/format'

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return fmtTime(iso)
}

class SyncLeagueLine extends Component {
  template({ info }: any) {
    return (
      <div class={info.ok ? 'sync-league-line ok' : 'sync-league-line err'}>
        <span class="sync-league-name">{info.name}</span>
        {info.ok ? (
          <span class="sync-league-detail">
            {info.seen} maç · {info.changed} değişiklik{info.complete ? '' : ' · eksik bitti'}
          </span>
        ) : (
          <span class="sync-league-detail">{info.error ?? 'Senkronizasyon başarısız.'}</span>
        )}
      </div>
    )
  }
}

export default class DataTab extends Component {
  template() {
    const sync = adminStore.data?.sync
    return (
      <div class="admin-data">
        <div class="data-grid">
          <div class="data-item">
            <span class="data-label">Sağlayıcı</span>
            <span class="data-value">ESPN (CL · EL · UECL · Süper Lig)</span>
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
          Senkronizasyon iki ligi paralel çalıştırır.
        </div>
        {adminStore.lastSyncLeagues.length > 0 ? (
          <div class="sync-league-box">
            <div class="sync-league-title">Son senkronizasyon · lig bazlı</div>
            {adminStore.lastSyncLeagues.map(info => (
              <SyncLeagueLine key={info.code} info={info} />
            ))}
          </div>
        ) : null}
      </div>
    )
  }
}
