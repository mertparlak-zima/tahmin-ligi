import uiStore from '../stores/ui-store'
import ToastItem from './ToastItem'

export default function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {uiStore.toasts.map(t => <ToastItem key={t.id} toast={t} />)}
    </div>
  )
}
