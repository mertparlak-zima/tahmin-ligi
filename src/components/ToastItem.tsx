import uiStore from '../stores/ui-store'

// Denetim turu (#31): toast'a tıklayınca kapanır (uzun hata mesajları
// beklemek zorunda değilsin).
export default function ToastItem({ toast }: { toast: { id: number; message: string } }) {
  return (
    <div class="toast" role="status" click={() => uiStore.dismissToast(toast.id)}>
      {toast.message}
    </div>
  )
}
