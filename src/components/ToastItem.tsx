export default function ToastItem({ toast }: { toast: { id: number; message: string } }) {
  return <div class="toast">{toast.message}</div>
}
