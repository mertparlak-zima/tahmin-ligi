// MatchItem (#12 B): MatchRow + koşullu akordiyon içeriği.
// Accordion modunda satır tıklanınca altında tahminler açılır (admin
// EditorRow deseni — tek kök div + içerde ternary; kural 12'ye uyum).
// #21 Faz 3: akordiyon üstünde takım form çipleri (payload home.form /
// away.form — buildTeamForms tüm takımları kapsar; TSL'de 4 büyük dışı
// takımlar da form çipli gelir). FormChips yalnız dolu formla mount
// edilir (erken return null'lı function component, AGENTS kural 4).
//
// #24 Faz 2: BAŞLAMAMIŞ (ve ertelenmemiş) maçlarda akordiyon gövdesi
// herkese açık TAHMİN GİRİŞ FORMU olur (EntryForm): tüm aktif oyuncular
// listelenir, kim isterse kim için olursa tahmin girer/kaldırır, satır içi
// "+ Oyuncu" formuyla yeni oyuncu eklenir. #39: mühür kalktı — giriş
// formundaki seçimler kayıtlı sunucu değerinden SEÇİLİ gelir; başlamış
// maçlarda açılan tahmin satırları gösterilir.
// Gea: class component'ler (kural 13 — function default + local class yasak),
// keyed map öğeleri bileşen (kural 6), listeler doğrudan store getter'ından
// (kural 7), map callback'i yalnız kendi prop'ları + doğrudan store okur
// (kural 9), tek kök + içerde ternary (kural 12), satır içi panel .open CSS
// deseni (kural 4).

import { Component } from '@geajs/core'
import uiStore from '../stores/ui-store'
import leagueStore from '../stores/league-store'
import predictionsStore from '../stores/predictions-store'
import MatchRow from './MatchRow'
import PredRow from './PredRow'
import Avatar from './Avatar'
import Crest from './Crest'
import FormChips from './FormChips'
import { cn } from '../utils/cn'

/** Giriş formunun tek oyuncu satırı: avatar + isim + "girdi" rozeti +
 *  TAKIM LOGOLU segment seçici (#24 kullanıcı isteği: "FB kazanacak" tarzı
 *  etiketler + crest; 1/X/2 yerine) + temizle. #39: sunucudaki kayıtlı
 *  değer (baseline) kickoff öncesi de bilinir — taslak yoksa seçim
 *  SUNUCU değerinden gösterilir (başka cihazdan girilen de görünür). */
class EntryRow extends Component {
  template({ player, match }: any) {
    const matchId = match.id
    const key = `${player.id}:${matchId}`
    const hasDraft = key in predictionsStore.drafts
    const draft = predictionsStore.drafts[key] ?? ''
    const saved = match.predictions.find((p: any) => p.playerId === player.id)?.outcome ?? ''
    const sel = hasDraft ? draft : saved
    const dirty = predictionsStore.isDirty(matchId, player.id)
    // Denetim turu (#31, kural 9): "girdi" rozeti PARENT map gövdesinde değil
    // burada — kendi prop'undan okur, bayat kapanış riski yok.
    const hasPick = saved !== ''
    // Kısa etiket (#24 kullanıcı isteği): "FB kazanacak" tarzı — TLA varsa
    // onu ('FEN'), yoksa kısa ad (uzun adlar CSS'te kırpılır).
    const homeTag = match.home.tla ?? match.home.short
    const awayTag = match.away.tla ?? match.away.short
    return (
      <div class={cn('entry-row', dirty && 'dirty')}>
        <Avatar
          color={player.color}
          initials={player.initials}
          photo={player.avatarUrl ?? null}
          size="sm"
          title={player.name}
        />
        <span class="entry-name">{player.name}</span>
        {/* "girdi": bu oyuncunun maça zaten kayıtlı tahmini var (#39: değeri
            de seçili görünür); yeni seçim kaydedilince üzerine yazılır,
            ✕ kaydedilince silinir. */}
        {hasPick ? <span class="entry-badge">girdi</span> : null}
        <span class="entry-seg" role="group" aria-label={`Tahmin: ${player.name}`}>
          <button
            class={cn('entry-seg-btn team', sel === 'H' && 'on')}
            title={`${match.home.name} kazanır`}
            aria-pressed={sel === 'H' ? 'true' : 'false'}
            click={() => predictionsStore.setDraft(matchId, player.id, 'H')}
          >
            <Crest name={match.home.name} short={match.home.short} crest={match.home.crest} size={14} />
            <span class="entry-seg-label">{homeTag} kazanacak</span>
          </button>
          <button
            class={cn('entry-seg-btn draw', sel === 'D' && 'on')}
            title="Beraberlik"
            aria-pressed={sel === 'D' ? 'true' : 'false'}
            click={() => predictionsStore.setDraft(matchId, player.id, 'D')}
          >
            <span class="entry-seg-label">Beraberlik</span>
          </button>
          <button
            class={cn('entry-seg-btn team', sel === 'A' && 'on')}
            title={`${match.away.name} kazanır`}
            aria-pressed={sel === 'A' ? 'true' : 'false'}
            click={() => predictionsStore.setDraft(matchId, player.id, 'A')}
          >
            <Crest name={match.away.name} short={match.away.short} crest={match.away.crest} size={14} />
            <span class="entry-seg-label">{awayTag} kazanacak</span>
          </button>
        </span>
        {/* Temizle: taslak seçimi '' yapar (kaydedince tahmin silinir).
            Boş satırda anlamsız olduğundan yalnız silinecek bir şey varken bas. */}
        <button
          class="entry-clear"
          aria-label={`${player.name} tahminini temizle`}
          title="Tahmini temizle (kaydedince silinir)"
          click={() => {
            if (sel !== '' || hasPick) predictionsStore.setDraft(matchId, player.id, '')
          }}
        >
          ✕
        </button>
      </div>
    )
  }
}

/** Renk çipi (keyed map öğesi ham element olamaz — kural 6). */
class ColorChip extends Component {
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

/** Başlamamış maçın giriş formu: oyuncu satırları + "+ Oyuncu" + Kaydet. */
class EntryForm extends Component {
  template({ match }: any) {
    const dirtyCount = predictionsStore.dirtyCount(match.id)
    const saving = predictionsStore.saving[match.id] === true
    return (
      <div class="entry-form">
        <div class="entry-list">
          {leagueStore.players.map(player => (
            <EntryRow
              key={player.id}
              player={player}
              match={match}
            />
          ))}
          {leagueStore.players.length === 0 ? (
            <div class="entry-empty">Henüz oyuncu yok — aşağıdaki düğmeden ekle.</div>
          ) : null}
        </div>

        <button class="entry-add" click={() => predictionsStore.openPlayerForm()}>+ Oyuncu</button>

        {/* Satır içi oyuncu formu — .open CSS deseni (kural 4). */}
        <div class={cn('entry-player-form', predictionsStore.playerFormOpen && 'open')}>
          <input
            class="input"
            type="text"
            placeholder="Yeni oyuncu adı"
            maxlength="40"
            aria-label="Yeni oyuncu adı"
            value={predictionsStore.playerForm.name}
            input={e => predictionsStore.setPlayerName((e.target as HTMLInputElement).value)}
          />
          <span class="entry-colors" role="group" aria-label="Oyuncu rengi">
            {predictionsStore.palette.map(chip => (
              <ColorChip
                key={chip}
                color={chip}
                selected={predictionsStore.playerForm.color === chip}
                onSelect={() => predictionsStore.setPlayerColor(chip)}
              />
            ))}
          </span>
          <button class="btn ghost sm" click={() => predictionsStore.closePlayerForm()}>Vazgeç</button>
          <button
            class="btn primary sm"
            disabled={predictionsStore.playerSaving || predictionsStore.playerForm.name.trim().length < 2}
            click={() => predictionsStore.createPlayer()}
          >
            {predictionsStore.playerSaving ? 'Ekleniyor…' : 'Ekle'}
          </button>
        </div>

        <div class="entry-save">
          <span class="entry-save-info">Takım rozetlerine dokun: kimin kazanacağını seç — yalnız bu maç için kaydedilir.</span>
          <button
            class="btn primary sm"
            disabled={dirtyCount === 0 || saving}
            click={() => predictionsStore.saveMatch(match.id)}
          >
            {saving ? 'Kaydediliyor…' : dirtyCount > 0 ? `Kaydet (${dirtyCount})` : 'Kaydet'}
          </button>
        </div>
      </div>
    )
  }
}

export default class MatchItem extends Component {
  template({ match }: any) {
    // Giriş formu koşulu: henüz başlamamış + bitmemiş + ertelenmemiş maç.
    // (ui-store missingMatches ile aynı durum tanımı.)
    // Denetim turu (#31): kickoff İSTEMCİ taraftan da kontrol edilir — iki
    // poll arasında maç başlarsa form açık kalıyor ve ancak kayıtta 409
    // yiyordu. Şimdi kickoff geçince form kapanır (bir poll gecikmesi
    // olabilir; API 409 otorite olarak kalır, bu yalnız UX katmanı).
    const kickoffPassed = Date.parse(match.kickoff) <= Date.now()
    const isEntry = !kickoffPassed && !match.isStarted && !match.isFinished && match.statusGroup !== 'inactive'
    return (
      <div class="match-item">
        <MatchRow match={match} onToggle={() => uiStore.toggleMatchAccordion(match.id)} />
        {uiStore.openMatchId === match.id ? (
          <div class="match-acc-body">
            {match.home.form.length > 0 || match.away.form.length > 0 ? (
              <div class="match-acc-forms">
                {match.home.form.length > 0 ? (
                  <div class="match-acc-form">
                    <span class="match-acc-form-team">{match.home.short} · son 5</span>
                    <FormChips form={match.home.form} />
                  </div>
                ) : null}
                {match.away.form.length > 0 ? (
                  <div class="match-acc-form">
                    <span class="match-acc-form-team">{match.away.short} · son 5</span>
                    <FormChips form={match.away.form} />
                  </div>
                ) : null}
              </div>
            ) : null}
            {isEntry ? (
              <EntryForm match={match} />
            ) : kickoffPassed && !match.isStarted && !match.isFinished && match.statusGroup !== 'inactive' ? (
              <div class="match-acc-empty">Maç başladı — tahmin girişi kilitlendi. Veriler tazelenince tahminler açılır.</div>
            ) : match.predictions.length === 0 ? (
              <div class="match-acc-empty">Bu maça tahmin girilmemiş.</div>
            ) : (
              <div class="match-acc-list">
                {match.predictions.map((pred: any) => (
                  <PredRow key={pred.playerId} pred={pred} isLive={match.isLive} />
                ))}
                {match.isFinished ? (
                  <div class="pred-legend">
                    <span><i class="dot hit"></i>Doğru</span>
                    <span><i class="dot miss"></i>Yanlış</span>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    )
  }
}
