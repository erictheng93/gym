/**
 * useApiError composable
 * Centralized API error handling with user-friendly messages
 */

interface ApiErrorOptions {
  showToast?: boolean
  fallbackMessage?: string
}

// Error code to user-friendly message mapping
const ERROR_MESSAGES: Record<string, string> = {
  // Authentication errors
  'INVALID_CREDENTIALS': '帳號或密碼錯誤',
  'TOKEN_EXPIRED': '登入已過期，請重新登入',
  'UNAUTHORIZED': '請先登入',
  'FORBIDDEN': '您沒有權限執行此操作',

  // OTP errors
  'OTP_EXPIRED': '驗證碼已過期，請重新發送',
  'OTP_INVALID': '驗證碼錯誤',
  'OTP_TOO_MANY_ATTEMPTS': '嘗試次數過多，請稍後再試',
  'PHONE_NOT_FOUND': '此手機號碼尚未註冊',

  // Member errors
  'MEMBER_NOT_FOUND': '找不到會員資料',
  'MEMBER_INACTIVE': '您的會籍已停用',
  'MEMBER_SUSPENDED': '您的帳號已被暫停',

  // Contract errors
  'CONTRACT_NOT_FOUND': '找不到合約',
  'CONTRACT_EXPIRED': '合約已到期',
  'CONTRACT_ALREADY_PAUSED': '合約已經處於暫停狀態',
  'CONTRACT_NOT_PAUSED': '合約並非暫停狀態',
  'PAUSE_LIMIT_EXCEEDED': '已達暫停次數上限',

  // Booking errors
  'SESSION_FULL': '此課程已額滿',
  'SESSION_NOT_FOUND': '找不到此課程',
  'ALREADY_BOOKED': '您已預約此課程',
  'BOOKING_NOT_FOUND': '找不到預約紀錄',
  'CANCEL_TOO_LATE': '已超過取消時限',
  'NO_REMAINING_COUNTS': '課程堂數已用完',

  // Network errors
  'NETWORK_ERROR': '網路連線失敗，請檢查網路後再試',
  'TIMEOUT': '請求逾時，請稍後再試',
  'SERVER_ERROR': '伺服器發生錯誤，請稍後再試',

  // Validation errors
  'VALIDATION_ERROR': '資料格式錯誤，請檢查後再試',
  'INVALID_PHONE': '請輸入有效的手機號碼',
  'INVALID_EMAIL': '請輸入有效的 Email',
}

export const useApiError = () => {
  const toast = useToast()

  /**
   * Parse error and return user-friendly message
   */
  const parseError = (error: unknown, fallbackMessage = '發生錯誤，請稍後再試'): string => {
    // Handle null/undefined
    if (!error) return fallbackMessage

    // Handle string error
    if (typeof error === 'string') {
      return ERROR_MESSAGES[error] || error
    }

    // Handle $fetch error response
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>

      // Check for error code in data
      if ('data' in err && typeof err.data === 'object' && err.data !== null) {
        const data = err.data as Record<string, unknown>

        // Check for error code
        if ('code' in data && typeof data.code === 'string') {
          const message = ERROR_MESSAGES[data.code]
          if (message) return message
        }

        // Check for message
        if ('message' in data && typeof data.message === 'string') {
          return data.message
        }

        // Check for errors array (validation errors)
        if ('errors' in data && Array.isArray(data.errors)) {
          const firstError = data.errors[0]
          if (typeof firstError === 'object' && firstError !== null && 'message' in firstError) {
            return String(firstError.message)
          }
        }
      }

      // Check for status code
      if ('statusCode' in err || 'status' in err) {
        const status = (err.statusCode || err.status) as number
        if (status === 401) return ERROR_MESSAGES.UNAUTHORIZED
        if (status === 403) return ERROR_MESSAGES.FORBIDDEN
        if (status === 404) return '找不到資源'
        if (status === 422) return ERROR_MESSAGES.VALIDATION_ERROR
        if (status >= 500) return ERROR_MESSAGES.SERVER_ERROR
      }

      // Check for network error
      if ('message' in err) {
        const msg = String(err.message).toLowerCase()
        if (msg.includes('network') || msg.includes('fetch')) {
          return ERROR_MESSAGES.NETWORK_ERROR
        }
        if (msg.includes('timeout')) {
          return ERROR_MESSAGES.TIMEOUT
        }
        return String(err.message)
      }
    }

    return fallbackMessage
  }

  /**
   * Handle error with optional toast notification
   */
  const handleError = (error: unknown, options: ApiErrorOptions = {}): string => {
    const { showToast = true, fallbackMessage } = options
    const message = parseError(error, fallbackMessage)

    if (showToast) {
      toast.error(message)
    }

    return message
  }

  /**
   * Wrap async function with error handling
   */
  const withErrorHandling = <T>(
    fn: () => Promise<T>,
    options: ApiErrorOptions = {}
  ): Promise<T | null> => {
    return fn().catch((error) => {
      handleError(error, options)
      return null
    })
  }

  return {
    parseError,
    handleError,
    withErrorHandling,
    ERROR_MESSAGES,
  }
}
