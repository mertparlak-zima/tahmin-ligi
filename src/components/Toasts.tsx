import uiStore from '../stores/ui-store'

export default function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {uiStore.toasts.map(t => (
        <div class="toast" key={t.id}>{t.message}</div>
      ))}
    </div>
  )
}
