import { cn } from '../utils/cn'

export default function FormChips({ form }: { form: string[] }) {
  if (!form || form.length === 0) return null
  return (
    <span class="form-chips">
      {form.map((letter: string, i: number) => (
        <span class={cn('form-chip', letter === 'G' && 'win', letter === 'B' && 'draw', letter === 'M' && 'loss')} key={i}>
          {letter}
        </span>
      ))}
    </span>
  )
}
