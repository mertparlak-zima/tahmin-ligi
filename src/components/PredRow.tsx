import Avatar from './Avatar'
import { cn } from '../utils/cn'

export default function PredRow({ pred, isLive }: { pred: any; isLive: boolean }) {
  return (
    <div class="pred-row">
      <Avatar color={pred.color} initials={pred.initials} />
      <span class="pred-name">{pred.name}</span>
      <span class="pred-label">{pred.label}</span>
      {pred.points === null || pred.points === undefined ? (
        <span class="pred-points pending">{isLive ? 'CANLI' : 'Bekliyor'}</span>
      ) : (
        <span class={cn('pred-points', pred.correct ? 'hit' : 'miss')}>+{pred.points} P</span>
      )}
    </div>
  )
}
