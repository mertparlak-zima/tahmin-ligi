import { cn } from '../utils/cn'

export default function SegButton({ active, label, hasLive = false, onSelect }: {
  active: boolean
  label: string
  hasLive?: boolean
  onSelect: () => void
}) {
  return (
    <button class={cn('seg-item', active && 'active')} click={onSelect}>
      {label}
      {hasLive ? <span class="seg-live-dot"></span> : null}
    </button>
  )
}
