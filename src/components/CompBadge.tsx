import { cn } from '../utils/cn'

const COMPETITION_COLORS: Record<string, string> = {
  CL: '#6db6ff',
  EL: '#ff9f68',
  UECL: '#39dfb2',
  // #21: Süper Lig — altın (kırmızı TSL teması/canlı göstergesiyle çakışmasın).
  TSL: '#ffd05c',
}

export default function CompBadge({ code, size = 'md' }: { code: string; size?: 'sm' | 'md' }) {
  const color = COMPETITION_COLORS[code] ?? '#91a6bd'
  return (
    <span
      class={cn('comp-badge', size === 'sm' && 'comp-badge-sm')}
      style={{ '--badge-color': color } as any}
    >
      {code}
    </span>
  )
}
