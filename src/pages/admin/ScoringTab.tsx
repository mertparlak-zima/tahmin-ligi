// Puanlama Kuralı (#20 U6): SALT-OKUNUR — kural DB'den yönetilir
// (Supabase app_config 'scoring'); UI yalnızca mevcut kuralı ve hesabı açıklar.
import { Component } from '@geajs/core'
import adminStore from '../../stores/admin-store'

export default class ScoringTab extends Component {
  template() {
    const s = adminStore.data?.scoring
    if (!s) {
      return <div class="empty">Puanlama kuralı yüklenemedi.</div>
    }
    return (
      <div class="admin-scoring">
        <div class="admin-hint">
          Puanlama kuralı <b>yalnızca veritabanından</b> yönetilir (Supabase →
          app_config → <code>scoring</code>). Burada bilgi amaçlı görünür;
          puanlar her istekte güncel kurala göre yeniden hesaplanır.
        </div>
        <div class="data-grid" style={{ maxWidth: '480px' } as any}>
          <div class="data-item">
            <span class="data-label">Kural</span>
            <span class="data-value">{s.label}</span>
          </div>
          <div class="data-item">
            <span class="data-label">Doğru sonuç puanı</span>
            <span class="data-value">{s.correctOutcome} puan</span>
          </div>
          <div class="data-item">
            <span class="data-label">Durum</span>
            <span class="data-value">{s.status === 'final' ? 'Kesinleşti' : 'Geçici'}</span>
          </div>
        </div>
        <div class="field-hint" style={{ maxWidth: '480px' } as any}>
          Hesap: biten her maçta doğru sonuca {s.correctOutcome} puan; sezonluk
          bonuslar puana eklenir. Eşitlikte önce doğru sayısı, sonra isim
          sıralaması bozar. Durum "Geçici"yken puan tablosunda oyunculara
          "(geçici)" notu görünür; sezon sonunda DB'den "final" yapılır.
        </div>
      </div>
    )
  }
}
