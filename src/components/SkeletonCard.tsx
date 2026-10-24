export default function SkeletonCard({ shape = 'row' }: { shape?: 'row' | 'stat' | 'table' }) {
  return <div class={`skeleton-card ${shape}`}></div>
}
