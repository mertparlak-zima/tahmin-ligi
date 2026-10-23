import Avatar from '../../components/Avatar'
import adminStore from '../../stores/admin-store'
import { cn } from '../../utils/cn'

export default function PlayerRow({ player }: { player: any }) {
  return (
    <div class="player-row">
      <Avatar color={player.color} initials={player.initials} />
      <span class="player-name">{player.name}</span>
      <span class={cn('player-state', player.isActive ? 'active' : 'passive')}>
        {player.isActive ? 'Aktif' : 'Pasif'}
      </span>
      <button class="btn ghost sm" click={() => adminStore.togglePlayer(player)}>
        {player.isActive ? 'Pasif yap' : 'Aktifleştir'}
      </button>
    </div>
  )
}
