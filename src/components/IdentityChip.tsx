import Avatar from './Avatar'
import { cn } from '../utils/cn'

export default function IdentityChip({ player, selected, onSelect }: {
  player: any
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button class={cn('identity-chip', selected && 'selected')} click={onSelect}>
      <Avatar color={player.color} initials={player.initials} />
      <span class="identity-name">{player.name}</span>
    </button>
  )
}
