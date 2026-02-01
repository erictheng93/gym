/**
 * useToast composable
 * Centralized toast notification system for the member app
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration: number
  dismissible: boolean
}

interface ToastOptions {
  duration?: number
  dismissible?: boolean
}

const DEFAULT_DURATION = 4000
const MAX_TOASTS = 3

export const useToast = () => {
  const toasts = useState<Toast[]>('toast_messages', () => [])

  const generateId = () => `toast_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  const addToast = (type: ToastType, message: string, options: ToastOptions = {}) => {
    const toast: Toast = {
      id: generateId(),
      type,
      message,
      duration: options.duration ?? DEFAULT_DURATION,
      dismissible: options.dismissible ?? true,
    }

    // Limit max toasts
    if (toasts.value.length >= MAX_TOASTS) {
      toasts.value = toasts.value.slice(1)
    }

    toasts.value = [...toasts.value, toast]

    // Auto dismiss
    if (toast.duration > 0) {
      setTimeout(() => {
        dismiss(toast.id)
      }, toast.duration)
    }

    return toast.id
  }

  const dismiss = (id: string) => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  const dismissAll = () => {
    toasts.value = []
  }

  // Convenience methods
  const success = (message: string, options?: ToastOptions) => addToast('success', message, options)
  const error = (message: string, options?: ToastOptions) => addToast('error', message, { duration: 6000, ...options })
  const warning = (message: string, options?: ToastOptions) => addToast('warning', message, options)
  const info = (message: string, options?: ToastOptions) => addToast('info', message, options)

  // Object-based method for easier usage
  const show = (opts: { message: string; type: ToastType } & ToastOptions) => {
    return addToast(opts.type, opts.message, opts)
  }

  return {
    toasts: readonly(toasts),
    addToast: show,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
  }
}
