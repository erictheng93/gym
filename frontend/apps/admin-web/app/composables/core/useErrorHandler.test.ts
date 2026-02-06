/**
 * useErrorHandler.test.ts
 * Tests for the error handling composable
 *
 * Note: This test needs to unmock useErrorHandler since vitest.setup.ts mocks it globally
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockToast, mockNavigateTo } from '@test/setup'

// Unmock useErrorHandler to test the actual implementation
vi.unmock('~/composables/core/useErrorHandler')

// Mock Sentry - use inline mock to avoid hoisting issues
vi.mock('@sentry/vue', () => ({
  captureException: vi.fn()
}))

// Mock constants
vi.mock('~/constants', () => ({
  MESSAGES: {
    ERRORS: {
      NETWORK: '網路連線錯誤',
      UNAUTHORIZED: '權限不足',
      GENERIC: '發生錯誤，請稍後再試'
    }
  }
}))

// Need to import after mocks
import { useErrorHandler, type AppError } from './useErrorHandler'
import * as Sentry from '@sentry/vue'

describe('useErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(Sentry.captureException).mockClear()
    mockToast.error.mockClear()
    mockNavigateTo.mockClear()
  })

  describe('parseError - 錯誤類型識別', () => {
    it('應該識別 network 類型 - TypeError with fetch', () => {
      const { parseError } = useErrorHandler()
      const error = new TypeError('Failed to fetch')

      const result = parseError(error)

      expect(result.type).toBe('network')
      expect(result.message).toBe('網路連線錯誤')
      expect(result.retryable).toBe(true)
    })

    it('應該識別 network 類型 - timeout error', () => {
      const { parseError } = useErrorHandler()
      const error = new Error('Request timeout')

      const result = parseError(error)

      expect(result.type).toBe('network')
      expect(result.retryable).toBe(true)
    })

    it('應該識別 network 類型 - connection error', () => {
      const { parseError } = useErrorHandler()
      const error = new Error('Connection refused')

      const result = parseError(error)

      expect(result.type).toBe('network')
      expect(result.retryable).toBe(true)
    })

    it('應該識別 network 類型 - aborted error', () => {
      const { parseError } = useErrorHandler()
      const error = new Error('Request aborted')

      const result = parseError(error)

      expect(result.type).toBe('network')
    })

    it('應該識別 network 類型 - ECONNREFUSED', () => {
      const { parseError } = useErrorHandler()
      const error = new Error('ECONNREFUSED localhost:8056')

      const result = parseError(error)

      expect(result.type).toBe('network')
    })

    it('應該識別 auth 類型 - INVALID_CREDENTIALS', () => {
      const { parseError } = useErrorHandler()
      const error = {
        errors: [{
          message: '帳號或密碼錯誤',
          extensions: { code: 'INVALID_CREDENTIALS' }
        }]
      }

      const result = parseError(error)

      expect(result.type).toBe('auth')
      expect(result.code).toBe('AUTH_ERROR')
      expect(result.retryable).toBe(false)
    })

    it('應該識別 auth 類型 - INVALID_TOKEN', () => {
      const { parseError } = useErrorHandler()
      const error = {
        errors: [{
          message: 'Token 無效',
          extensions: { code: 'INVALID_TOKEN' }
        }]
      }

      const result = parseError(error)

      expect(result.type).toBe('auth')
    })

    it('應該識別 auth 類型 - TOKEN_EXPIRED', () => {
      const { parseError } = useErrorHandler()
      const error = {
        errors: [{
          message: 'Token 已過期',
          extensions: { code: 'TOKEN_EXPIRED' }
        }]
      }

      const result = parseError(error)

      expect(result.type).toBe('auth')
    })

    it('應該識別 auth 類型 - FORBIDDEN', () => {
      const { parseError } = useErrorHandler()
      const error = {
        errors: [{
          message: '無權限',
          extensions: { code: 'FORBIDDEN' }
        }]
      }

      const result = parseError(error)

      expect(result.type).toBe('auth')
    })

    it('應該識別 business 類型 - API error with message', () => {
      const { parseError } = useErrorHandler()
      const error = {
        errors: [{
          message: '會員已存在'
        }]
      }

      const result = parseError(error)

      expect(result.type).toBe('business')
      expect(result.message).toBe('會員已存在')
      expect(result.retryable).toBe(false)
    })

    it('應該識別 unknown 類型 - standard Error', () => {
      const { parseError } = useErrorHandler()
      const error = new Error('Something went wrong')

      const result = parseError(error)

      expect(result.type).toBe('unknown')
      expect(result.message).toBe('Something went wrong')
      expect(result.retryable).toBe(false)
    })

    it('應該識別 unknown 類型 - 非標準錯誤', () => {
      const { parseError } = useErrorHandler()
      const error = { random: 'object' }

      const result = parseError(error)

      expect(result.type).toBe('unknown')
      expect(result.message).toBe('發生錯誤，請稍後再試')
    })

    it('應該識別 unknown 類型 - null error', () => {
      const { parseError } = useErrorHandler()
      const error = null

      const result = parseError(error)

      expect(result.type).toBe('unknown')
    })

    it('應該識別 unknown 類型 - undefined error', () => {
      const { parseError } = useErrorHandler()
      const error = undefined

      const result = parseError(error)

      expect(result.type).toBe('unknown')
    })

    it('應該在 context 中包含額外資訊', () => {
      const { parseError } = useErrorHandler()
      const error = 'string error'

      const result = parseError(error, 'fetchMembers')

      expect(result.details).toEqual({ error: 'string error', context: 'fetchMembers' })
    })
  })

  describe('handleError - Toast 通知', () => {
    it('應該預設顯示 Toast 錯誤通知', () => {
      const { handleError } = useErrorHandler()
      const error = new Error('Test error')

      handleError(error)

      expect(mockToast.error).toHaveBeenCalledWith('Test error')
    })

    it('應該使用自定義訊息覆蓋錯誤訊息', () => {
      const { handleError } = useErrorHandler()
      const error = new Error('Original error')

      handleError(error, { customMessage: '自定義錯誤訊息' })

      expect(mockToast.error).toHaveBeenCalledWith('自定義錯誤訊息')
    })

    it('應該在 showToast: false 時不顯示通知', () => {
      const { handleError } = useErrorHandler()
      const error = new Error('Silent error')

      handleError(error, { showToast: false })

      expect(mockToast.error).not.toHaveBeenCalled()
    })
  })

  describe('handleError - 認證錯誤導向', () => {
    it('應該在認證錯誤時重定向到 /login', () => {
      const { handleError } = useErrorHandler()
      const error = {
        errors: [{
          message: 'Token expired',
          extensions: { code: 'TOKEN_EXPIRED' }
        }]
      }

      handleError(error)

      expect(mockNavigateTo).toHaveBeenCalledWith('/login')
    })

    it('應該在 redirectOnAuth: false 時不重定向', () => {
      const { handleError } = useErrorHandler()
      const error = {
        errors: [{
          message: 'Token expired',
          extensions: { code: 'TOKEN_EXPIRED' }
        }]
      }

      handleError(error, { redirectOnAuth: false })

      expect(mockNavigateTo).not.toHaveBeenCalled()
    })
  })

  describe('handleError - 回調函數', () => {
    it('應該執行 onHandled 回調', () => {
      const { handleError } = useErrorHandler()
      const error = new Error('Test error')
      const onHandled = vi.fn()

      handleError(error, { onHandled })

      expect(onHandled).toHaveBeenCalledWith(expect.objectContaining({
        type: 'unknown',
        message: 'Test error'
      }))
    })

    it('應該在回調中傳遞正確的 AppError 結構', () => {
      const { handleError } = useErrorHandler()
      const error = new TypeError('Failed to fetch')
      const onHandled = vi.fn()

      handleError(error, { onHandled })

      const passedError: AppError = onHandled.mock.calls[0][0]
      expect(passedError.type).toBe('network')
      expect(passedError.retryable).toBe(true)
      expect(passedError.details).toBeDefined()
    })
  })

  describe('handleError - 返回值', () => {
    it('應該返回解析後的 AppError', () => {
      const { handleError } = useErrorHandler()
      const error = new Error('Test error')

      const result = handleError(error)

      expect(result).toEqual(expect.objectContaining({
        type: expect.any(String),
        message: expect.any(String),
        retryable: expect.any(Boolean)
      }))
    })
  })

  describe('withErrorHandling - 包裝函數錯誤處理', () => {
    it('應該成功執行並返回 data', async () => {
      const { withErrorHandling } = useErrorHandler()
      const mockData = { id: 1, name: 'Test' }

      const result = await withErrorHandling(async () => mockData)

      expect(result.data).toEqual(mockData)
      expect(result.error).toBeNull()
    })

    it('應該在錯誤時返回 error 和 null data', async () => {
      const { withErrorHandling } = useErrorHandler()
      const testError = new Error('Async error')

      const result = await withErrorHandling(async () => {
        throw testError
      })

      expect(result.data).toBeNull()
      expect(result.error).toEqual(expect.objectContaining({
        type: 'unknown',
        message: 'Async error'
      }))
    })

    it('應該使用 fallback 值', async () => {
      const { withErrorHandling } = useErrorHandler()
      const fallbackData = { default: true }

      const result = await withErrorHandling(
        async () => { throw new Error('Error') },
        { fallback: fallbackData }
      )

      expect(result.data).toEqual(fallbackData)
    })

    it('應該傳遞 options 到 handleError', async () => {
      const { withErrorHandling } = useErrorHandler()

      await withErrorHandling(
        async () => { throw new Error('Error') },
        { context: 'testContext', showToast: false }
      )

      expect(mockToast.error).not.toHaveBeenCalled()
    })
  })

  describe('createErrorBoundary - 錯誤邊界創建', () => {
    it('應該創建帶有 catch 方法的邊界', () => {
      const { createErrorBoundary } = useErrorHandler()
      const boundary = createErrorBoundary('TestBoundary')

      expect(boundary.catch).toBeInstanceOf(Function)
      expect(boundary.catchSilent).toBeInstanceOf(Function)
    })

    it('catch 應該處理錯誤並顯示 Toast', () => {
      const { createErrorBoundary } = useErrorHandler()
      const boundary = createErrorBoundary('TestBoundary')
      const error = new Error('Boundary error')

      boundary.catch(error)

      expect(mockToast.error).toHaveBeenCalled()
    })

    it('catch 應該支援自定義訊息', () => {
      const { createErrorBoundary } = useErrorHandler()
      const boundary = createErrorBoundary('TestBoundary')
      const error = new Error('Original')

      boundary.catch(error, '自定義錯誤')

      expect(mockToast.error).toHaveBeenCalledWith('自定義錯誤')
    })

    it('catchSilent 應該處理錯誤但不顯示 Toast', () => {
      const { createErrorBoundary } = useErrorHandler()
      const boundary = createErrorBoundary('TestBoundary')
      const error = new Error('Silent error')

      boundary.catchSilent(error)

      expect(mockToast.error).not.toHaveBeenCalled()
    })

    it('catch 應該返回 AppError', () => {
      const { createErrorBoundary } = useErrorHandler()
      const boundary = createErrorBoundary('TestBoundary')
      const error = new Error('Test error')

      const result = boundary.catch(error)

      expect(result).toEqual(expect.objectContaining({
        type: expect.any(String),
        message: expect.any(String)
      }))
    })
  })
})
