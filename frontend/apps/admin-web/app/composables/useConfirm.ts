/**
 * 確認對話框系統
 * 替代原生 window.confirm()
 */

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
}

interface ConfirmState {
  isOpen: boolean
  options: ConfirmOptions | null
  resolve: ((value: boolean) => void) | null
}

const state = ref<ConfirmState>({
  isOpen: false,
  options: null,
  resolve: null
})

export const useConfirm = () => {
  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      state.value = {
        isOpen: true,
        options: {
          confirmText: '確認',
          cancelText: '取消',
          type: 'warning',
          ...options
        },
        resolve
      }
    })
  }

  const handleConfirm = () => {
    if (state.value.resolve) {
      state.value.resolve(true)
    }
    close()
  }

  const handleCancel = () => {
    if (state.value.resolve) {
      state.value.resolve(false)
    }
    close()
  }

  const close = () => {
    state.value = {
      isOpen: false,
      options: null,
      resolve: null
    }
  }

  return {
    state: readonly(state),
    confirm,
    handleConfirm,
    handleCancel,
    close
  }
}
