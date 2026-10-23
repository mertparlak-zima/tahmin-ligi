// Ortak avatar (renk + baş harfler). Aynı işaretleme gereken her yerde kullanılır.

export default function Avatar({ color, initials, size = '', title = '' }: {
  color: string
  initials: string
  size?: '' | 'sm' | 'lg' | 'xl'
  title?: string
}) {
  const cls = `avatar${size ? ` ${size}` : ''}`
  return (
    <span class={cls} style={{ '--avatar-color': color } as any} title={title || undefined}>
      {initials}
    </span>
  )
}
