import { Component } from '@geajs/core'
import adminStore from '../stores/admin-store'
import PredictionsTab from './admin/PredictionsTab'
import PlayersTab from './admin/PlayersTab'
import ScoringTab from './admin/ScoringTab'
import DataTab from './admin/DataTab'
import SkeletonCard from '../components/SkeletonCard'
import { cn } from '../utils/cn'

const TABS = [
  { key: 'predictions', label: 'Tahminler' },
  { key: 'players', label: 'Oyuncular' },
  { key: 'scoring', label: 'Puanlama' },
  { key: 'data', label: 'Veri' },
]

class LoginGate extends Component {
  password = ''

  submit(e: Event) {
    e.preventDefault()
    if (this.password) adminStore.login(this.password)
  }

  template() {
    return (
      <div class="admin-login">
        <form class="admin-login-card" submit={e => this.submit(e)}>
          <div class="admin-login-title">Yönetim Paneli</div>
          <input
            class="input"
            type="password"
            placeholder="Yönetim şifresi"
            autocomplete="current-password"
            value={this.password}
            input={e => (this.password = (e.target as HTMLInputElement).value)}
          />
          {adminStore.error ? <div class="error-box">{adminStore.error}</div> : null}
          <button class="btn primary" type="submit" disabled={adminStore.loading || !this.password}>
            {adminStore.loading ? 'Kontrol ediliyor…' : 'Giriş yap'}
          </button>
        </form>
      </div>
    )
  }
}

export default class AdminPage extends Component {
  created() {
    if (adminStore.authed && !adminStore.data) adminStore.bootstrap()
  }

  template() {
    if (!adminStore.authed) return <LoginGate />

    if (adminStore.loading && !adminStore.data) {
      return (
        <div class="page-skeleton">
          {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
        </div>
      )
    }

    if (adminStore.error && !adminStore.data) {
      return (
        <div class="error-state">
          <div class="error-title">Panel verisi yüklenemedi</div>
          <div class="error-sub">{adminStore.error}</div>
          <div class="row-actions">
            <button class="btn primary" click={() => adminStore.bootstrap()}>Tekrar dene</button>
          </div>
        </div>
      )
    }

    return (
      <div class="admin-page">
        <div class="admin-head">
          <div class="admin-tabs">
            <button class={cn('admin-tab', adminStore.tab === 'predictions' && 'active')} click={() => (adminStore.tab = 'predictions')}>
              Tahminler
            </button>
            <button class={cn('admin-tab', adminStore.tab === 'players' && 'active')} click={() => (adminStore.tab = 'players')}>
              Oyuncular
            </button>
            <button class={cn('admin-tab', adminStore.tab === 'scoring' && 'active')} click={() => (adminStore.tab = 'scoring')}>
              Puanlama Kuralı
            </button>
            <button class={cn('admin-tab', adminStore.tab === 'data' && 'active')} click={() => (adminStore.tab = 'data')}>
              Veri
            </button>
          </div>
        </div>

        {adminStore.tab === 'predictions' ? <PredictionsTab /> : null}
        {adminStore.tab === 'players' ? <PlayersTab /> : null}
        {adminStore.tab === 'scoring' ? <ScoringTab /> : null}
        {adminStore.tab === 'data' ? <DataTab /> : null}
      </div>
    )
  }
}
