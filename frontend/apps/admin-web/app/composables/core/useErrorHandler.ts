/**
 * 全局錯誤處理 Composable
 * 統一處理應用程式中的各種錯誤類型
 */

import * as Sentry from '@sentry/vue'
import { MESSAGES } from '~/constants'

// 錯誤類型定義
export type ErrorType = 'network' | 'auth' | 'validation' | 'business' | 'unknown'

export interface AppError {
  type: ErrorType
  message: string
  code?: string
  details?: unknown
  retryable: boolean
}

// API 錯誤結構
interface ApiErrorResponse {
  errors?: Array<{
    message: string
    extensions?: {
      code?: string
    }
  }>
}

/**
 * 判斷是否為網路錯誤
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true
  }
  if (error instanceof Error) {
    const networkMessages = ['network', 'timeout', 'aborted', 'connection', 'ECONNREFUSED']
    return networkMessages.some(msg => error.message.toLowerCase().includes(msg.toLowerCase()))
  }
  return false
}

/**
 * 判斷是否為認證錯誤
 */
function isAuthError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const err = error as ApiErrorResponse
    if (err.errors?.[0]?.extensions?.code) {
      const code = err.errors[0].extensions.code
      return ['INVALID_CREDENTIALS', 'INVALID_TOKEN', 'TOKEN_EXPIRED', 'FORBIDDEN'].includes(code)
    }
  }
  return false
}

/**
 * 從 API 錯誤中提取訊息
 */
function extractApiMessage(error: unknown): string | null {
  if (typeof error === 'object' && error !== null) {
    const err = error as ApiErrorResponse
    if (err.errors?.[0]?.message) {
      return err.errors[0].message
    }
  }
  return null
}

/**
 * 解析錯誤並返回結構化的 AppError
 */
function parseError(error: unknown, context?: string): AppError {
  // 網路錯誤
  if (isNetworkError(error)) {
    return {
      type: 'network',
      message: MESSAGES.ERRORS.NETWORK,
      retryable: true,
      details: error
    }
  }

  // 認證錯誤
  if (isAuthError(error)) {
    const apiMessage = extractApiMessage(error)
    return {
      type: 'auth',
      message: apiMessage || MESSAGES.ERRORS.UNAUTHORIZED,
      code: 'AUTH_ERROR',
      retryable: false,
      details: error
    }
  }

  // API 業務錯誤
  const apiMessage = extractApiMessage(error)
  if (apiMessage) {
    return {
      type: 'business',
      message: apiMessage,
      retryable: false,
      details: error
    }
  }

  // 標準 Error 物件
  if (error instanceof Error) {
    return {
      type: 'unknown',
      message: error.message || MESSAGES.ERRORS.GENERIC,
      retryable: false,
      details: error
    }
  }

  // 未知錯誤
  return {
    type: 'unknown',
    message: MESSAGES.ERRORS.GENERIC,
    retryable: false,
    details: { error, context }
  }
}

/**
 * 全局錯誤處理 Composable
 */
export function useErrorHandler() {
  const toast = useToast()

  /**
   * 處理錯誤並顯示通知
   * @param error - 捕獲的錯誤
   * @param options - 錯誤處理選項
   */
  const handleError = (
    error: unknown,
    options?: {
      /** 錯誤發生的上下文，用於日誌 */
      context?: string
      /** 是否顯示 Toast 通知（預設 true） */
      showToast?: boolean
      /** 自定義錯誤訊息（覆蓋自動解析的訊息） */
      customMessage?: string
      /** 認證錯誤時是否重定向到登入頁（預設 true） */
      redirectOnAuth?: boolean
      /** 錯誤處理完成後的回調 */
      onHandled?: (appError: AppError) => void
    }
  ): AppError => {
    const {
      context,
      showToast = true,
      customMessage,
      redirectOnAuth = true,
      onHandled
    } = options || {}

    // 解析錯誤
    const appError = parseError(error, context)

    // 開發環境下輸出詳細錯誤
    if (import.meta.dev) {
      console.group(`[ErrorHandler] ${context || 'Unknown Context'}`)
      console.error('Error Type:', appError.type)
      console.error('Message:', appError.message)
      console.error('Retryable:', appError.retryable)
      console.error('Details:', appError.details)
      console.groupEnd()
    }

    // Report to Sentry (skip auth errors which are expected during session checks)
    if (!import.meta.dev && appError.type !== 'auth') {
      try {
        Sentry.captureException(error, {
          tags: {
            errorType: appError.type,
            context: context || 'unknown',
            retryable: String(appError.retryable),
          },
          extra: {
            appError,
            customMessage,
          },
          level: appError.type === 'network' ? 'warning' : 'error',
        })
      } catch {
        // Sentry not initialized or failed - silently ignore
      }
    }

    // 處理認證錯誤 - 重定向到登入頁
    if (appError.type === 'auth' && redirectOnAuth) {
      navigateTo('/login')
    }

    // 顯示 Toast 通知
    if (showToast) {
      const message = customMessage || appError.message
      toast.error(message)
    }

    // 執行回調
    if (onHandled) {
      onHandled(appError)
    }

    return appError
  }

  /**
   * 包裝異步函數，自動處理錯誤
   * @param fn - 要執行的異步函數
   * @param options - 錯誤處理選項
   */
  const withErrorHandling = async <T>(
    fn: () => Promise<T>,
    options?: {
      context?: string
      showToast?: boolean
      customMessage?: string
      fallback?: T
    }
  ): Promise<{ data: T | null; error: AppError | null }> => {
    const { fallback } = options || {}

    try {
      const data = await fn()
      return { data, error: null }
    } catch (error) {
      const appError = handleError(error, options)
      return { data: fallback ?? null, error: appError }
    }
  }

  /**
   * 創建一個錯誤邊界，用於 try-catch 塊
   * @param context - 錯誤上下文
   */
  const createErrorBoundary = (context: string) => {
    return {
      catch: (error: unknown, customMessage?: string) => {
        return handleError(error, { context, customMessage })
      },
      catchSilent: (error: unknown) => {
        return handleError(error, { context, showToast: false })
      }
    }
  }

  return {
    handleError,
    withErrorHandling,
    createErrorBoundary,
    parseError
  }
}

// 導出類型供其他模組使用
export type { ApiErrorResponse }
