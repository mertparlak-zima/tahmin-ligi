// Akordiyon içi tek oyuncu tahmin satırı (#20 U4): avatar + isim + seçici.
// Taslak anahtarı 'pid:mid' burada kendi prop'larından türetilir (AGENTS
// kural 9 — map closure'ında store türetmesi yok); kirliyse (draft≠baseline)
// satır vurgulanır, kaydedince vurgu düşer.

import adminStore from '../../stores/admin-store'
import Avatar from '../../components/Avatar'
import { cn } from '../../utils/cn'

export default function EditorPlayerRow({ player, match }: { player: any; match: any }) {
  const key = `${player.id}:${match.id}`
  const draft = adminStore.drafts[key] ?? ''
  return (
    <div class={cn('acc-pred-row', draft !== (adminStore.baseline[key] ?? '') && 'dirty')}>
      <Avatar
        color={player.color}
        initials={player.initials}
        photo={player.avatarUrl ?? null}
        size="sm"
        title={player.name}
      />
      <span class="acc-pred-name">{player.name}</span>
      <select
        class="acc-pred-select"
        value={draft}
        change={e => adminStore.setDraft(match.id, player.id, (e.target as HTMLSelectElement).value)}
      >
        <option value="">Boş</option>
        <option value="H">{match.homeShort} yener</option>
        <option value="D">Beraberlik</option>
        <option value="A">{match.awayShort} yener</option>
      </select>
    </div>
  )
}
