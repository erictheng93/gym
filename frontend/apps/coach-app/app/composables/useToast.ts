/**
 * useToast - Toast Notifications Composable
 */

interface Toast {
  id: number
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

let toastId = 0

export const useToast = () => {
  const toasts = useState<Toast[]>('toasts', () => [])

  const addToast = (type: Toast['type'], message: string, duration = 3000) => {
    const id = ++toastId
    toasts.value.push({ id, type, message })

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
  }

  const removeToast = (id: number) => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  const success = (message: string, duration?: number) => addToast('success', message, duration)
  const error = (message: string, duration?: number) => addToast('error', message, duration)
  const warning = (message: string, duration?: number) => addToast('warning', message, duration)
  const info = (message: string, duration?: number) => addToast('info', message, duration)

  return {
    toasts,
    success,
    error,
    warning,
    info,
    removeToast,
  }
}
