/**
 * useFormSubmit - 表單提交 Composable
 *
 * 提供標準化的表單提交處理，包含 loading 狀態、錯誤處理和 toast 通知
 *
 * @example
 * const { isSubmitting, submitError, submit } = useFormSubmit()
 *
 * const handleSubmit = async () => {
 *   const result = await submit(
 *     () => createMember(formData),
 *     {
 *       successMessage: '會員建立成功',
 *       errorMessage: '建立會員失敗',
 *       onSuccess: (data) => router.push('/members')
 *     }
 *   )
 * }
 */

import { ref } from 'vue'

export interface SubmitOptions<T> {
  /** 成功時顯示的 toast 訊息 */
  successMessage?: string
  /** 失敗時顯示的 toast 訊息（會覆蓋 API 錯誤訊息） */
  errorMessage?: string
  /** 成功後的回調函數 */
  onSuccess?: (result: T) => void | Promise<void>
  /** 失敗後的回調函數 */
  onError?: (error: Error) => void
  /** 是否在錯誤時顯示 toast（預設 true） */
  showErrorToast?: boolean
  /** 是否在成功時顯示 toast（預設 true） */
  showSuccessToast?: boolean
}

export interface FormSubmitReturn {
  /** 是否正在提交 */
  isSubmitting: ReturnType<typeof ref<boolean>>
  /** 提交錯誤訊息（如果有） */
  submitError: ReturnType<typeof ref<string | null>>
  /** 提交函數 */
  submit: <T>(fn: () => Promise<T>, options?: SubmitOptions<T>) => Promise<T | null>
  /** 清除錯誤訊息 */
  clearError: () => void
  /** 設定錯誤訊息 */
  setError: (message: string) => void
}

/**
 * 表單提交 Composable
 */
export function useFormSubmit(): FormSubmitReturn {
  const toast = useToast()
  const isSubmitting = ref(false)
  const submitError = ref<string | null>(null)

  /**
   * 清除錯誤訊息
   */
  const clearError = (): void => {
    submitError.value = null
  }

  /**
   * 設定錯誤訊息
   */
  const setError = (message: string): void => {
    submitError.value = message
  }

  /**
   * 執行表單提交
   */
  const submit = async <T>(
    fn: () => Promise<T>,
    options: SubmitOptions<T> = {}
  ): Promise<T | null> => {
    const {
      successMessage,
      errorMessage,
      onSuccess,
      onError,
      showErrorToast = true,
      showSuccessToast = true
    } = options

    // 清除之前的錯誤
    clearError()

    // 設定提交狀態
    isSubmitting.value = true

    try {
      // 執行提交函數
      const result = await fn()

      // 成功處理
      if (successMessage && showSuccessToast) {
        toast.success(successMessage)
      }

      // 執行成功回調
      if (onSuccess) {
        await onSuccess(result)
      }

      return result
    } catch (error) {
      // 錯誤處理
      const errorMsg = error instanceof Error ? error.message : '操作失敗，請稍後再試'
      const displayMessage = errorMessage || errorMsg

      // 設定錯誤訊息
      setError(displayMessage)

      // 顯示錯誤 toast
      if (showErrorToast) {
        toast.error(displayMessage)
      }

      // 執行錯誤回調
      if (onError) {
        onError(error instanceof Error ? error : new Error(errorMsg))
      }

      return null
    } finally {
      isSubmitting.value = false
    }
  }

  return {
    isSubmitting,
    submitError,
    submit,
    clearError,
    setError
  }
}

export default useFormSubmit
