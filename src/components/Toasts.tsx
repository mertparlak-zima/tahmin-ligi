import uiStore from '../stores/ui-store'
import ToastItem from './ToastItem'

export default function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {uiStore.toasts.map(toastEntry => <ToastItem key={toastEntry.id} toast={toastEntry} />)}
    </div>
  )
}
