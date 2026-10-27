// Oyuncular (#20 U8 + #24): kimlik/"Bu benim" akışı KALDIRILDI (panel-siz
// modelde herkes herkes için girer; kart listesi + detay yeter). Karta
// tıklayınca o oyuncunun karne detayı açılır.
// Gea: class component, erken return yok; türetilmiş listeler store'da
// (ui-store playerMatches/missingMatches, league-store playerPredictionStats).

import { Component } from '@geajs/core'
import leagueStore from '../stores/league-store'
import uiStore from '../stores/ui-store'
import avatarStore from '../stores/avatar-store'
import predictionsStore from '../stores/predictions-store'
import Avatar from '../components/Avatar'
import FormChips from '../components/FormChips'
import PredictionCard from '../components/PredictionCard'
import Crest from '../components/Crest'
import CompBadge from '../components/CompBadge'
import SkeletonCard from '../components/SkeletonCard'
import AvatarCropModal from '../components/AvatarCropModal'
import { fmtFullDate, fmtTime } from '../utils/format'
import { cn } from '../utils/cn'

class PlayerCard extends Component {
  template({ player, stats }: any) {
    return (
      <button
        class="player-card"
        click={() => {
          leagueStore.selectPlayer(player.id)
        }}
      >
        <span class="player-card-top">
          <Avatar color={player.color} initials={player.initials} size="lg" photo={player.avatarUrl ?? null} />
        </span>
        <span class="player-card-name">{player.name}</span>
        <span class="player-card-stats">
          <b>{player.points}</b> puan · {player.correctOutcomes} doğru
        </span>
        <span class="player-card-sub">%{player.accuracy} isabet</span>
        <span class="player-card-tags">
          {stats && stats.sealed > 0 ? <span class="player-tag sealed">🔒 {stats.sealed} mühürlü</span> : null}
          {stats && stats.missing > 0 ? <span class="player-tag missing">{stats.missing} girilmedi</span> : null}
        </span>
        {stats && stats.form.length > 0 ? <FormChips form={stats.form} /> : null}
      </button>
    )
  }
}

class MissingRow extends Component {
  template({ match }: any) {
    return (
      <div class="missing-row">
        <CompBadge code={match.competitionCode} size="sm" />
        <span class="missing-teams">
          <Crest name={match.home.name} short={match.home.short} crest={match.home.crest} size={22} />
          <span>{match.home.short}</span>
          <span class="missing-vs">–</span>
          <Crest name={match.away.name} short={match.away.short} crest={match.away.crest} size={22} />
          <span>{match.away.short}</span>
        </span>
        <span class="missing-time">{fmtFullDate(match.kickoff)} · {fmtTime(match.kickoff)}</span>
        <span class="player-tag missing">tahmin yok</span>
      </div>
    )
  }
}

// Denetim turu (#31): düzenleme formunun renk çipi (MatchItem ColorChip
// deseninin kopyası — keyed map öğesi bileşen olmalı, kural 6).
class EditColorChip extends Component {
  template({ color, selected, onSelect }: any) {
    return (
      <button
        class={cn('entry-color-chip', selected && 'on')}
        style={{ background: color } as any}
        aria-label={`Renk ${color}`}
        aria-pressed={selected ? 'true' : 'false'}
        click={onSelect}
      ></button>
    )
  }
}

// Detay görünümü child component'i (#20 U8): playerId prop'u JSX BINDING'inden
// gelir (doğrudan store okuması → taze); hesaplamalar kendi prop'undan yapar
// (kural 9 deseni — body const'ları bayat kalıyordu, view anahtarı bu yüzden
// parent JSX'inde doğrudan store okumasıyla çevrilir).
class PlayerDetail extends Component {
  template({ playerId }: any) {
    const player = leagueStore.standings.find((r: any) => r.id === playerId)
    const pRow = leagueStore.players.find((p: any) => p.id === playerId)
    const matches = uiStore.playerMatches(playerId)
    const sealed = uiStore.sealedCountOf(playerId)
    const missing = uiStore.missingMatches(playerId)
    const wrong = player ? player.played - player.correctOutcomes : 0
    const avatarRemoving = avatarStore.removingPlayerId === playerId
    return (
      <div>
        <button
          class="players-back"
          click={() => {
            // T3 review (#31): panele dönüşte düzenle/sil formları açık kalmasın.
            predictionsStore.closeEdit()
            predictionsStore.cancelDeletePlayer()
            leagueStore.closePlayerDetail()
          }}
        >‹ Oyuncular</button>
        <div class="identity-hero">
          <Avatar color={pRow?.color ?? '#b8f34a'} initials={pRow?.initials ?? '?'} size="xl" photo={pRow?.avatarUrl ?? null} />
          <div class="identity-hero-text">
            <span class="identity-name">{pRow?.name ?? 'Oyuncu'}</span>
            <span class="identity-sub">
              {player ? `${player.rank}. sırada · ${player.played} maçta tahmin` : 'Henüz sıralaması yok'}
            </span>
            {/* #24 Faz 2: avatar yükle/değiştir/kaldır. #31: oyuncu
                düzenle/sil (PATCH/DELETE uçları ilk kez UI'a bağlandı). */}
            {pRow ? (
              <span class="avatar-actions">
                <button class="btn ghost sm" click={() => avatarStore.openEditor(pRow)}>
                  {pRow.avatarUrl ? 'Fotoğrafı değiştir' : 'Fotoğraf yükle'}
                </button>
                {pRow.avatarUrl ? (
                  <button class="btn ghost sm" disabled={avatarRemoving} click={() => avatarStore.remove(pRow.id)}>
                    {avatarRemoving ? 'Kaldırılıyor…' : 'Kaldır'}
                  </button>
                ) : null}
                <button class="btn ghost sm" click={() => predictionsStore.openEdit(pRow)}>Düzenle</button>
                <button class="btn ghost sm danger" click={() => predictionsStore.askDeletePlayer(pRow)}>Sil</button>
              </span>
            ) : null}
          </div>
        </div>
        <AvatarCropModal />

        {/* Düzenleme paneli — .open CSS deseni (kural 4). */}
        <div class={cn('entry-player-form player-edit-form', predictionsStore.editOpen && 'open')}>
          <input
            class="input"
            type="text"
            placeholder="Oyuncu adı"
            maxlength="40"
            aria-label="Oyuncu adı"
            value={predictionsStore.editForm.name}
            input={e => predictionsStore.setEditName((e.target as HTMLInputElement).value)}
          />
          <span class="entry-colors" role="group" aria-label="Oyuncu rengi">
            {predictionsStore.palette.map(chip => (
              <EditColorChip
                key={chip}
                color={chip}
                selected={predictionsStore.editForm.color === chip}
                onSelect={() => predictionsStore.setEditColor(chip)}
              />
            ))}
          </span>
          <button class="btn ghost sm" click={() => predictionsStore.closeEdit()}>Vazgeç</button>
          <button
            class="btn primary sm"
            disabled={predictionsStore.editSaving || predictionsStore.editForm.name.trim().length < 2}
            click={() => predictionsStore.saveEdit()}
          >
            {predictionsStore.editSaving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>

        {/* Sil onayı — .open CSS deseni; tahminli oyuncuda API 409 mesajı
            toast'ta aynen görünür. */}
        <div class={cn('player-delete-confirm', predictionsStore.deleteConfirmOpen && 'open')}>
          <span class="player-delete-text">
            <b>{pRow?.name ?? 'Oyuncu'}</b> kalıcı olarak silinsin mi? Tahmini olan oyuncu silinemez.
          </span>
          <button class="btn ghost sm" disabled={predictionsStore.deleteSaving} click={() => predictionsStore.cancelDeletePlayer()}>Vazgeç</button>
          <button
            class="btn primary sm danger"
            disabled={predictionsStore.deleteSaving}
            click={() => predictionsStore.confirmDeletePlayer()}
          >
            {predictionsStore.deleteSaving ? 'Siliniyor…' : 'Evet, sil'}
          </button>
        </div>

        <div class="stat-cards">
          <div class="stat-card">
            <span class="stat-label">Puan</span>
            <span class="stat-value">{player?.points ?? 0}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Doğru sonuç</span>
            <span class="stat-value">{player?.correctOutcomes ?? 0}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Yanlış sonuç</span>
            <span class="stat-value">{wrong}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">İsabet</span>
            <span class="stat-value">{player?.accuracy ?? 0}%</span>
          </div>
        </div>

        {sealed > 0 ? (
          <div class="sealed-note">🔒 {sealed} tahmini mühürlü — maçlar başlayınca açılacak.</div>
        ) : null}

        {matches.length === 0 ? (
          <div class="empty">
            <div class="empty-title">Açılan tahmin yok</div>
            <div class="empty-sub">Maçlar başlayınca tahminler burada listelenir.</div>
          </div>
        ) : (
          <div class="pred-cards">
            {uiStore.playerMatches(playerId).map(match => (
              <PredictionCard key={match.id} match={match} identityId={playerId} />
            ))}
          </div>
        )}

        {missing.length > 0 ? (
          <div class="missing-section">
            <div class="sheet-section-title">
              Girilmeyen maçlar
              <span class="sheet-section-meta">{missing.length} maç</span>
            </div>
            {uiStore.missingMatches(playerId).map(match => (
              <MissingRow key={match.id} match={match} />
            ))}
          </div>
        ) : null}
      </div>
    )
  }
}

export default class PlayersPage extends Component {
  template() {
    if (leagueStore.loadingInitial) {
      return (
        <div class="page-skeleton">
          <div class="stat-cards">
            {[0, 1, 2, 3].map(i => <SkeletonCard key={i} shape="stat" />)}
          </div>
          {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
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

    // View anahtarı JSX İÇİNDE doğrudan store okumasıyla (body const bayat
    // kalıyor; binding taze — kanıtlandı). Detay, prop'lu child component.
    const standings = leagueStore.standings
    return (
      <div class="players-page">
        {leagueStore.selectedPlayerId === '' ? (
          <div>
            <div class="page-meta">
              <span class="meta-main">{standings.length} oyuncu · tahminler</span>
            </div>

            <div class="players-grid">
              {standings.map(row => (
                <PlayerCard key={row.id} player={row} stats={leagueStore.playerPredictionStats[row.id]} />
              ))}
            </div>
            {standings.length === 0 ? (
              <div class="empty big">
                <div class="empty-title">Henüz oyuncu yok</div>
                <div class="empty-sub">Maçlar sayfasında bir maç açıp '+ Oyuncu' ile ekle.</div>
              </div>
            ) : null}
          </div>
        ) : (
          <PlayerDetail playerId={leagueStore.selectedPlayerId} />
        )}
      </div>
    )
  }
}
