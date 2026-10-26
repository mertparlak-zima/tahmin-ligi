import { Link } from '@geajs/core'
import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import SegButton from './SegButton'
import { cn } from '../utils/cn'
import { fmtTime } from '../utils/format'

/** #21 Faz 2: lige göre marka alt yazısı (statik istemci haritası). */
const BRAND_SUBTITLES: Record<string, string> = {
  EU: '4 takım · 3 kupa · arkadaş ligi',
  TSL: 'Tüm Süper Lig · arkadaş ligi',
}

export default function TopBar() {
  const meta = leagueStore.data?.meta
  const stale = leagueStore.staleInfo
  const staleOpen = stale.level !== 'none'
  return (
    <header class="topbar">
      <div class="topbar-inner">
        <Link to="/" class="brand" aria-label="Ana sayfa">
          <span class="brand-mark">
            <img src="/favicon.svg" alt="" />
          </span>
          <div class="brand-text">
            <span class="brand-name">{meta?.leagueName ?? 'Tahmin Ligi'}</span>
            <span class="brand-sub">{leagueStore.league === 'TSL' ? BRAND_SUBTITLES.TSL : BRAND_SUBTITLES.EU}</span>
          </div>
        </Link>
        <div class="topbar-actions">
          {leagueStore.hasLive ? (
            <span class="live-pill">
              <span class="live-dot"></span>Canlı
            </span>
          ) : null}
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
      {/* #21 Faz 2: küresel lig değiştirici — meta.leagues payload'dan gelir,
          meta yüklenene dek gizli. SegButton deseni; liste doğrudan store
          getter'ından map'lenir (Gea kuralı 7), active/click store'dan okunur
          (Gea kuralı 9). */}
      {leagueStore.leagueOptions.length > 1 ? (
        <div class="league-switch-row">
          <div class="segmented league-switch" role="tablist" aria-label="Lig seçimi">
            {leagueStore.leagueOptions.map(lg => (
              <SegButton
                key={lg.code}
                active={leagueStore.league === lg.code}
                label={lg.name}
                onSelect={() => leagueStore.switchLeague(lg.code)}
              />
            ))}
          </div>
        </div>
      ) : null}
      {staleOpen ? (
        <div class={cn('stale-band', 'open', stale.level === 'offline' && 'offline')} role="status">
          <span class="stale-dot" aria-hidden="true"></span>
          <span class="stale-band-text">
            {stale.level === 'offline'
              ? 'Bağlantı kurulamıyor'
              : 'Canlı veri alınamıyor'}
            {stale.sinceIso ? ` — gösterilen veriler ${fmtTime(stale.sinceIso)} itibarıyla` : ''}
          </span>
        </div>
      ) : null}
    </header>
  )
}
