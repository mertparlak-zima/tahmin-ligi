import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import SkeletonCard from '../components/SkeletonCard'
import SeasonOption from '../components/SeasonOption'
import SegButton from '../components/SegButton'
import Podium from '../components/Podium'
import StandingsTable from '../components/StandingsTable'
import AccuracyTable from '../components/AccuracyTable'
import { fmtDay, fmtMonth } from '../utils/format'

/** Ay kısa adının ilk harfini büyütür ("eki" → "Eki"). */
function capMonth(key: string): string {
  const label = fmtMonth(key)
  return label.replace(/^./, ch => ch.toLocaleUpperCase('tr-TR'))
}

// #21 Faz 3: Haftanın tahmincisi bandı — veri league-store weeklyTop
// getter'ından (türetme store'da, Gea kuralı 7); render koşulu parent
// JSX'inde doğrudan store okumasıyla çevrilir (kural 11). Yalnız AKTİF
// sezon görünümünde gösterilir (arşiv sezonunda güncel hafta yanıltıcı —
// weeklyTop aktif sezon verisinden türetilir; #21 T3 review).
class WeeklyTopBanner extends Component {
  template() {
    const top = leagueStore.weeklyTop
    const sameMonth = top.weekStart.slice(0, 7) === top.weekEnd.slice(0, 7)
    return (
      <div class="weekly-top" role="status">
        🏆 Haftanın tahmincisi: <b>{top.names.join(', ')}</b> — {top.correctCount} doğru (
        {sameMonth
          ? `${fmtDay(top.weekStart)}–${fmtDay(top.weekEnd)} ${capMonth(top.weekEnd)}`
          : `${fmtDay(top.weekStart)} ${capMonth(top.weekStart)}–${fmtDay(top.weekEnd)} ${capMonth(top.weekEnd)}`}
        )
      </div>
    )
  }
}

// #21 Faz 3: İsabet Şampiyonası görünümü. Koşullar TEK düzeyli bloklar
// (zincirli ternary + prop'lu child sessiz boş render verdi); her koşul
// doğrudan store okumasıyla, tablo kendi içinde store getter'ından map'ler.
class ChampionshipView extends Component {
  created() {
    // #21 T3 review: görünüm açıkken lig değişirse (TopBar switcher) diğer
    // lig YENİDEN sağlanmalı — otherLeagueCode değişir, cache'te yoktur;
    // çağrı idempotent (cache doluysa no-op), observe'dan sızıntı zararsız.
    leagueStore.ensureOtherLeague()
    leagueStore.observe('league', () => leagueStore.ensureOtherLeague())
  }

  template() {
    return (
      <div class="championship-view">
        <div class="page-meta">
          <span class="meta-main">İki ligin isabet yüzdeleri birleşik</span>
          <span class="meta-side">Genel % = toplam doğru / toplam tahmin</span>
        </div>
        {leagueStore.accuracyError !== null && leagueStore.accuracyChampionship.length === 0 ? (
          <div class="error-state">
            <div class="error-title">İsabet verisi yüklenemedi</div>
            <div class="error-sub">{leagueStore.accuracyError}</div>
            <button class="btn primary" click={() => leagueStore.ensureOtherLeague()}>Tekrar dene</button>
          </div>
        ) : null}
        {leagueStore.accuracyError === null && leagueStore.accuracyLoading && leagueStore.accuracyChampionship.length === 0 ? (
          <div class="empty">Diğer ligin verisi yükleniyor…</div>
        ) : null}
        {leagueStore.accuracyChampionship.length > 0 ? <AccuracyTable /> : null}
        {leagueStore.accuracyError === null && !leagueStore.accuracyLoading && leagueStore.accuracyChampionship.length === 0 ? (
          <div class="empty">İsabet Şampiyonası için henüz veri yok.</div>
        ) : null}
      </div>
    )
  }
}

export default class StandingsPage extends Component {
  /** #21 Faz 3: sayfa görünümü — 'league' (lig puan tablosu) | 'championship'
   *  (İsabet Şampiyonası, iki lig birleşik). Yerel geçici UI durumu. */
  standingsView = 'league'

  openLeagueView() {
    this.standingsView = 'league'
  }

  openChampionship() {
    this.standingsView = 'championship'
    leagueStore.ensureOtherLeague()
  }

  template() {
    // "Geçmiş Sezonlar" (#18 PR2): seçili arşiv sezonu ayrı veriyle render edilir;
    // ana lig verisi (diğer sayfalar) aktif sezon olarak kalır.
    const view = leagueStore.standingsData

    if (leagueStore.loadingInitial || leagueStore.archiveLoading || (leagueStore.selectedSeason !== 0 && !view)) {
      return (
        <div class="page-skeleton">
          <div class="stat-cards">
            {[0, 1, 2, 3].map(i => <SkeletonCard key={i} shape="stat" />)}
          </div>
          <SkeletonCard shape="table" />
        </div>
      )
    }

    if (leagueStore.archiveError) {
      return (
        <div class="error-state">
          <div class="error-title">Sezon verisi yüklenemedi</div>
          <div class="error-sub">{leagueStore.archiveError}</div>
          <button class="btn primary" click={() => leagueStore.selectSeason(leagueStore.selectedSeason)}>Tekrar dene</button>
        </div>
      )
    }

    if (leagueStore.error && !leagueStore.data) {
      return (
        <div class="error-state">
          <div class="error-title">Veriler yüklenemedi</div>
          <div class="error-sub">{leagueStore.error}</div>
          <button class="btn primary" click={() => leagueStore.refresh()}>Tekrar dene</button>
        </div>
      )
    }

    const meta = view?.meta
    const standings: any[] = view?.standings ?? []
    const counts = meta?.counts
    const totalCorrect = standings.reduce((sum: number, r: any) => sum + r.correctOutcomes, 0)
    const average = standings.length > 0
      ? Math.round(standings.reduce((s: number, r: any) => s + r.points, 0) / standings.length)
      : 0

    return (
      <div class="standings-page">
        {/* #21 Faz 3: görünüm segmenti — yalnız birden fazla aktif lig varsa. */}
        {leagueStore.leagueOptions.length > 1 ? (
          <div class="standings-view-row">
            <div class="segmented standings-view-switch" role="tablist" aria-label="Puan görünümü">
              <SegButton active={this.standingsView === 'league'} label="Lig" onSelect={() => this.openLeagueView()} />
              <SegButton
                active={this.standingsView === 'championship'}
                label="İsabet Şampiyonası"
                onSelect={() => this.openChampionship()}
              />
            </div>
          </div>
        ) : null}

        {this.standingsView === 'championship' ? <ChampionshipView /> : null}

        {this.standingsView === 'league' ? (
          <div>
            {leagueStore.weeklyTop !== null && leagueStore.selectedSeason === 0 ? <WeeklyTopBanner /> : null}

            <div class="page-meta">
              <span class="meta-main">{counts?.players ?? 0} oyuncu · {counts?.finished ?? 0} biten maç</span>
              {meta?.scoring ? (
                <span class="meta-side">{meta.scoring.label}{meta.scoring.status === 'provisional' ? ' (geçici)' : ''}</span>
              ) : null}
              <span class="season-picker">
                <span class="season-picker-label">Geçmiş Sezonlar</span>
                <select
                  class="comp-select"
                  aria-label="Sezon"
                  value={String(leagueStore.selectedSeason)}
                  change={e => leagueStore.selectSeason(Number((e.target as HTMLSelectElement).value))}
                >
                  <option value="0">{leagueStore.activeSeasonLabel} (şu an)</option>
                  {leagueStore.pastSeasons.map(s => (
                    <SeasonOption key={s.year} value={s.year} label={s.label} />
                  ))}
                </select>
              </span>
            </div>

            <div class="stat-cards">
              <div class="stat-card">
                <span class="stat-label">Lider</span>
                <span class="stat-value">{meta?.leader?.name ?? '—'}</span>
                <span class="stat-sub">{meta?.leader ? `${meta.leader.points} puan` : 'Henüz maç bitmedi'}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Katılımcı</span>
                <span class="stat-value">{counts?.players ?? 0}</span>
                <span class="stat-sub">oyuncu</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Doğru sonuç</span>
                <span class="stat-value">{totalCorrect}</span>
                <span class="stat-sub">toplam isabet</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Ortalama</span>
                <span class="stat-value">{average}</span>
                <span class="stat-sub">puan / oyuncu</span>
              </div>
            </div>

            <Podium standings={standings} />
            <StandingsTable standings={standings} />

            <div class="table-legend">
              {/* #21: TSL'de sütun seti farklı — açıklama da lige göre. */}
              {leagueStore.league === 'TSL'
                ? 'O: oynanan maç · İsabet %: doğru tahmin oranı · P: puan'
                : 'O: oynanan maç · FB/GS/BJK/TS: takım bazlı doğru sonuç · P: puan'}
            </div>
          </div>
        ) : null}
      </div>
    )
  }
}
