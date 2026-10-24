import { Link } from '@geajs/core'
import leagueStore from '../stores/league-store'
import adminStore from '../stores/admin-store'
import uiStore from '../stores/ui-store'
import { cn } from '../utils/cn'

export default function TopBar() {
  const meta = leagueStore.data?.meta
  return (
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <span class="brand-mark">
            <img src="/favicon.svg" alt="" />
          </span>
          <div class="brand-text">
            <span class="brand-name">{meta?.leagueName ?? 'Tahmin Ligi'}</span>
            <span class="brand-sub">4 takım · 3 kupa · arkadaş ligi</span>
          </div>
        </div>
        <div class="topbar-actions">
          {leagueStore.hasLive ? (
            <span class="live-pill">
              <span class="live-dot"></span>Canlı
            </span>
          ) : null}
          <Link
            to="/admin"
            class={cn('icon-btn admin-link', adminStore.authed && 'authed')}
            aria-label="Yönetim paneli"
          >
            {adminStore.authed ? (
              <span class="admin-link-label">Panel</span>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3a4 4 0 0 0-4 4v2H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1V7a4 4 0 0 0-4-4z" />
                <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
              </svg>
            )}
          </Link>
          <button
            class={cn('icon-btn', leagueStore.loading && 'spinning')}
            aria-label="Yenile"
            click={async () => {
              await leagueStore.refresh()
              if (!leagueStore.error) uiStore.toast('Veriler yenilendi.')
              else uiStore.toast('Yenileme başarısız oldu.')
            }}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
