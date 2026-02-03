/**
 * Toast 通知系統
 * 輕量級實作，無需額外依賴
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration: number
}

const toasts = ref<Toast[]>([])

export const useToast = () => {
  const show = (message: string, type: ToastType = 'info', duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    const toast: Toast = { id, type, message, duration }

    toasts.value.push(toast)

    if (duration > 0) {
      setTimeout(() => {
        remove(id)
      }, duration)
    }

    return id
  }

  const remove = (id: string) => {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
  }

  const success = (message: string, duration?: number) => show(message, 'success', duration)
  const error = (message: string, duration?: number) => show(message, 'error', duration)
  const warning = (message: string, duration?: number) => show(message, 'warning', duration)
  const info = (message: string, duration?: number) => show(message, 'info', duration)

  // Object-based API for convenience
  const addToast = (options: { message: string; type?: ToastType; duration?: number }) => {
    return show(options.message, options.type ?? 'info', options.duration)
  }

  return {
    toasts: readonly(toasts),
    show,
    remove,
    success,
    error,
    warning,
    info,
    addToast
  }
}
