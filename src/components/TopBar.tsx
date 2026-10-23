import leagueStore from '../stores/league-store'
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
          <button
            class={cn('icon-btn', leagueStore.loading && 'spinning')}
            aria-label="Yenile"
            click={() => {
              leagueStore.refresh()
              uiStore.toast('Veriler yenilendi.')
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
