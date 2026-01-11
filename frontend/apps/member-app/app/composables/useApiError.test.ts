/**
 * Unit tests for useApiError composable
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useToast before importing the composable
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}

vi.stubGlobal('useToast', () => mockToast)

// Import after mocking
import { useApiError } from './useApiError'

describe('useApiError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parseError', () => {
    it('should return fallback for null error', () => {
      const { parseError } = useApiError()
      expect(parseError(null)).toBe('發生錯誤，請稍後再試')
    })

    it('should return fallback for undefined error', () => {
      const { parseError } = useApiError()
      expect(parseError(undefined)).toBe('發生錯誤，請稍後再試')
    })

    it('should use custom fallback message', () => {
      const { parseError } = useApiError()
      expect(parseError(null, '自訂錯誤')).toBe('自訂錯誤')
    })

    it('should map known error codes to Chinese messages', () => {
      const { parseError } = useApiError()
      expect(parseError('INVALID_CREDENTIALS')).toBe('帳號或密碼錯誤')
      expect(parseError('TOKEN_EXPIRED')).toBe('登入已過期，請重新登入')
      expect(parseError('OTP_EXPIRED')).toBe('驗證碼已過期，請重新發送')
      expect(parseError('SESSION_FULL')).toBe('此課程已額滿')
    })

    it('should extract message from error.data.code', () => {
      const { parseError } = useApiError()
      const error = { data: { code: 'UNAUTHORIZED' } }
      expect(parseError(error)).toBe('請先登入')
    })

    it('should extract message from error.data.message', () => {
      const { parseError } = useApiError()
      const error = { data: { message: '自訂 API 錯誤訊息' } }
      expect(parseError(error)).toBe('自訂 API 錯誤訊息')
    })

    it('should extract first validation error message', () => {
      const { parseError } = useApiError()
      const error = {
        data: {
          errors: [
            { message: '驗證錯誤一' },
            { message: '驗證錯誤二' },
          ],
        },
      }
      expect(parseError(error)).toBe('驗證錯誤一')
    })

    it('should handle 401 status code', () => {
      const { parseError } = useApiError()
      const error = { statusCode: 401 }
      expect(parseError(error)).toBe('請先登入')
    })

    it('should handle 403 status code', () => {
      const { parseError } = useApiError()
      const error = { statusCode: 403 }
      expect(parseError(error)).toBe('您沒有權限執行此操作')
    })

    it('should handle 404 status code', () => {
      const { parseError } = useApiError()
      const error = { statusCode: 404 }
      expect(parseError(error)).toBe('找不到資源')
    })

    it('should handle 422 status code', () => {
      const { parseError } = useApiError()
      const error = { statusCode: 422 }
      expect(parseError(error)).toBe('資料格式錯誤，請檢查後再試')
    })

    it('should handle 5xx status codes', () => {
      const { parseError } = useApiError()
      expect(parseError({ statusCode: 500 })).toBe('伺服器發生錯誤，請稍後再試')
      expect(parseError({ statusCode: 502 })).toBe('伺服器發生錯誤，請稍後再試')
      expect(parseError({ statusCode: 503 })).toBe('伺服器發生錯誤，請稍後再試')
    })

    it('should detect network errors from message', () => {
      const { parseError } = useApiError()
      expect(parseError({ message: 'Failed to fetch' })).toBe('網路連線失敗，請檢查網路後再試')
      expect(parseError({ message: 'NetworkError when...' })).toBe('網路連線失敗，請檢查網路後再試')
    })

    it('should detect timeout errors from message', () => {
      const { parseError } = useApiError()
      expect(parseError({ message: 'Request timeout' })).toBe('請求逾時，請稍後再試')
    })

    it('should return raw message if no mapping found', () => {
      const { parseError } = useApiError()
      expect(parseError({ message: 'Some unknown error' })).toBe('Some unknown error')
    })
  })

  describe('handleError', () => {
    it('should show toast by default', () => {
      const { handleError } = useApiError()
      handleError({ data: { message: '錯誤訊息' } })
      expect(mockToast.error).toHaveBeenCalledWith('錯誤訊息')
    })

    it('should not show toast when showToast is false', () => {
      const { handleError } = useApiError()
      handleError({ data: { message: '錯誤訊息' } }, { showToast: false })
      expect(mockToast.error).not.toHaveBeenCalled()
    })

    it('should return parsed error message', () => {
      const { handleError } = useApiError()
      const message = handleError({ data: { code: 'UNAUTHORIZED' } })
      expect(message).toBe('請先登入')
    })

    it('should use custom fallback message', () => {
      const { handleError } = useApiError()
      const message = handleError(null, { fallbackMessage: '操作失敗' })
      expect(message).toBe('操作失敗')
    })
  })

  describe('withErrorHandling', () => {
    it('should return result on success', async () => {
      const { withErrorHandling } = useApiError()
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withErrorHandling(fn)
      expect(result).toBe('success')
    })

    it('should return null and handle error on failure', async () => {
      const { withErrorHandling } = useApiError()
      const error = { data: { message: '操作失敗' } }
      const fn = vi.fn().mockRejectedValue(error)

      const result = await withErrorHandling(fn)
      expect(result).toBeNull()
      expect(mockToast.error).toHaveBeenCalledWith('操作失敗')
    })

    it('should pass options to handleError', async () => {
      const { withErrorHandling } = useApiError()
      const fn = vi.fn().mockRejectedValue(new Error('error'))

      await withErrorHandling(fn, { showToast: false })
      expect(mockToast.error).not.toHaveBeenCalled()
    })
  })

  describe('ERROR_MESSAGES', () => {
    it('should export error messages map', () => {
      const { ERROR_MESSAGES } = useApiError()
      expect(ERROR_MESSAGES).toBeDefined()
      expect(typeof ERROR_MESSAGES).toBe('object')
      expect(ERROR_MESSAGES.INVALID_CREDENTIALS).toBe('帳號或密碼錯誤')
    })
  })
})
