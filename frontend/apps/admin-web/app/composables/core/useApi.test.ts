// -nocheck
/**
 * useApi.test.ts
 * Tests for the API request enhancement composable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockHandleError, mockErrorHandlerInstance } from '@test/setup'

// Import after mocks
import { useApi, CACHE_KEYS, generateRequestKey, delay } from './useApi'

describe('useApi', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockHandleError.mockClear()
    mockErrorHandlerInstance.parseError.mockClear()
    // Configure parseError to return AppError
    mockErrorHandlerInstance.parseError.mockReturnValue({
      type: 'unknown',
      message: 'Test error',
      retryable: false
    })
    // Configure handleError to return AppError (critical for result.error)
    mockHandleError.mockReturnValue({
      type: 'unknown',
      message: 'Test error',
      retryable: false
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    // Clear cache between tests
    const { clearCache } = useApi()
    clearCache()
  })

  describe('CACHE_KEYS', () => {
    it('應該導出預定義的緩存鍵常量', () => {
      expect(CACHE_KEYS.MEMBERS).toBe('members')
      expect(CACHE_KEYS.CONTRACTS).toBe('contracts')
      expect(CACHE_KEYS.PAYMENTS).toBe('payments')
      expect(CACHE_KEYS.BRANCHES).toBe('branches')
      expect(CACHE_KEYS.EMPLOYEES).toBe('employees')
      expect(CACHE_KEYS.CLASSES).toBe('classes')
    })
  })

  describe('generateRequestKey', () => {
    it('應該生成唯一的請求標識', () => {
      const fn = () => Promise.resolve('test')
      const key1 = generateRequestKey(fn)
      const key2 = generateRequestKey(fn, ['arg1'])

      expect(key1).toBeDefined()
      expect(key2).toBeDefined()
      expect(key1).not.toBe(key2)
    })

    it('應該對相同函數和參數生成相同的鍵', () => {
      const fn = () => Promise.resolve('test')
      const args = ['arg1', 'arg2']
      const key1 = generateRequestKey(fn, args)
      const key2 = generateRequestKey(fn, args)

      expect(key1).toBe(key2)
    })
  })

  describe('delay', () => {
    it('應該延遲指定的毫秒數', async () => {
      const delayPromise = delay(1000)

      vi.advanceTimersByTime(999)
      expect(vi.getTimerCount()).toBe(1)

      vi.advanceTimersByTime(1)
      await delayPromise
    })
  })

  describe('request - 基本請求', () => {
    it('應該成功執行請求並返回數據', async () => {
      const { request } = useApi()
      const mockData = { id: 1, name: 'Test' }

      const result = await request(async () => mockData)

      expect(result.data).toEqual(mockData)
      expect(result.error).toBeNull()
      expect(result.fromCache).toBe(false)
    })

    it('應該在錯誤時返回 error', async () => {
      const { request } = useApi()
      const testError = new Error('Request failed')

      const result = await request(async () => {
        throw testError
      })

      expect(result.data).toBeNull()
      expect(result.error).toBeDefined()
    })

    it('應該調用 handleError 處理錯誤', async () => {
      const { request } = useApi()

      await request(async () => {
        throw new Error('Test error')
      }, { context: 'testContext' })

      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('request - 緩存 (TTL)', () => {
    it('應該在啟用緩存時緩存結果', async () => {
      const { request, clearCache } = useApi()
      clearCache()

      const mockFn = vi.fn().mockResolvedValue({ id: 1 })

      // 第一次請求
      const result1 = await request(mockFn, {
        cacheTTL: 5000,
        cacheKey: 'test-cache'
      })

      expect(result1.fromCache).toBe(false)
      expect(mockFn).toHaveBeenCalledTimes(1)

      // 第二次請求應該從緩存返回
      const result2 = await request(mockFn, {
        cacheTTL: 5000,
        cacheKey: 'test-cache'
      })

      expect(result2.fromCache).toBe(true)
      expect(result2.data).toEqual({ id: 1 })
      expect(mockFn).toHaveBeenCalledTimes(1) // 沒有再次調用
    })

    it('應該在緩存過期後重新請求', async () => {
      const { request, clearCache } = useApi()
      clearCache()

      const mockFn = vi.fn().mockResolvedValue({ id: 1 })

      // 第一次請求
      await request(mockFn, {
        cacheTTL: 1000,
        cacheKey: 'test-expire'
      })

      expect(mockFn).toHaveBeenCalledTimes(1)

      // 前進時間使緩存過期
      vi.advanceTimersByTime(1500)

      // 第二次請求應該重新獲取
      const result = await request(mockFn, {
        cacheTTL: 1000,
        cacheKey: 'test-expire'
      })

      expect(result.fromCache).toBe(false)
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('應該在 cacheTTL 為 0 時不緩存', async () => {
      const { request, clearCache } = useApi()
      clearCache()

      const mockFn = vi.fn().mockResolvedValue({ id: 1 })

      await request(mockFn, { cacheTTL: 0, cacheKey: 'no-cache' })
      await request(mockFn, { cacheTTL: 0, cacheKey: 'no-cache' })

      expect(mockFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('request - 請求去重', () => {
    it('應該去重同時進行的相同請求', async () => {
      const { request, clearCache } = useApi()
      clearCache()

      const mockFn = vi.fn().mockImplementation(() => {
        return new Promise(resolve => setTimeout(() => resolve({ id: 1 }), 100))
      })

      // 同時發起兩個相同請求
      const promise1 = request(mockFn, { cacheKey: 'dedupe-test', dedupe: true })
      const promise2 = request(mockFn, { cacheKey: 'dedupe-test', dedupe: true })

      vi.advanceTimersByTime(100)

      const [result1, result2] = await Promise.all([promise1, promise2])

      expect(result1.data).toEqual({ id: 1 })
      expect(result2.data).toEqual({ id: 1 })
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('應該在 dedupe: false 時不去重', async () => {
      const { request, clearCache } = useApi()
      clearCache()

      let callCount = 0
      const mockFn = vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({ id: callCount })
      })

      const promise1 = request(mockFn, { cacheKey: 'no-dedupe', dedupe: false })
      const promise2 = request(mockFn, { cacheKey: 'no-dedupe', dedupe: false })

      const [_result1, _result2] = await Promise.all([promise1, promise2])

      expect(mockFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('request - 重試邏輯', () => {
    it('應該在網路錯誤時重試', async () => {
      const { request } = useApi()
      let attempts = 0

      // Mock parseError 返回可重試的錯誤
      mockErrorHandlerInstance.parseError.mockReturnValue({
        type: 'network',
        message: 'Network error',
        retryable: true
      })

      const mockFn = vi.fn().mockImplementation(() => {
        attempts++
        if (attempts < 3) {
          throw new Error('Network error')
        }
        return Promise.resolve({ success: true })
      })

      const resultPromise = request(mockFn, {
        retries: 3,
        retryDelay: 100,
        dedupe: false
      })

      // 第一次失敗
      await vi.advanceTimersByTimeAsync(0)

      // 第一次重試
      await vi.advanceTimersByTimeAsync(100)

      // 第二次重試
      await vi.advanceTimersByTimeAsync(200)

      const result = await resultPromise

      expect(result.data).toEqual({ success: true })
      expect(mockFn).toHaveBeenCalledTimes(3)
    })

    it('應該對不可重試的錯誤不進行重試', async () => {
      const { request } = useApi()

      // Mock parseError 返回不可重試的錯誤
      mockErrorHandlerInstance.parseError.mockReturnValue({
        type: 'auth',
        message: 'Auth error',
        retryable: false
      })

      const mockFn = vi.fn().mockRejectedValue(new Error('Auth error'))

      const result = await request(mockFn, {
        retries: 3,
        retryDelay: 100,
        dedupe: false
      })

      expect(result.error).toBeDefined()
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('應該使用指數退避', async () => {
      const { request } = useApi()
      const delays: number[] = []
      let lastTime = Date.now()

      mockErrorHandlerInstance.parseError.mockReturnValue({
        type: 'network',
        message: 'Network error',
        retryable: true
      })

      const mockFn = vi.fn().mockImplementation(() => {
        const now = Date.now()
        if (delays.length > 0 || mockFn.mock.calls.length > 1) {
          delays.push(now - lastTime)
        }
        lastTime = now
        throw new Error('Network error')
      })

      const resultPromise = request(mockFn, {
        retries: 3,
        retryDelay: 100,
        dedupe: false
      })

      // 第一次嘗試
      await vi.advanceTimersByTimeAsync(0)

      // 第一次重試 (100ms * 1)
      await vi.advanceTimersByTimeAsync(100)

      // 第二次重試 (100ms * 2)
      await vi.advanceTimersByTimeAsync(200)

      // 第三次重試 (100ms * 3)
      await vi.advanceTimersByTimeAsync(300)

      await resultPromise

      expect(mockFn).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
    })
  })

  describe('batchRequest - 並行請求', () => {
    it('應該並行執行多個請求', async () => {
      const { batchRequest } = useApi()

      const fn1 = async () => ({ id: 1 })
      const fn2 = async () => ({ id: 2 })
      const fn3 = async () => ({ id: 3 })

      const { results } = await batchRequest([fn1, fn2, fn3] as const)

      expect(results).toHaveLength(3)
      expect(results[0].data).toEqual({ id: 1 })
      expect(results[1].data).toEqual({ id: 2 })
      expect(results[2].data).toEqual({ id: 3 })
    })

    it('應該為每個請求添加索引 context', async () => {
      const { batchRequest } = useApi()

      const fn1 = async () => { throw new Error('Error 1') }
      const fn2 = async () => ({ id: 2 })

      const { results } = await batchRequest([fn1, fn2] as const, {
        context: 'BatchTest'
      })

      expect(results[0].error).toBeDefined()
      expect(results[1].data).toEqual({ id: 2 })
    })

    it('應該處理部分請求失敗', async () => {
      const { batchRequest } = useApi()

      const fn1 = async () => ({ id: 1 })
      const fn2 = async () => { throw new Error('Failed') }
      const fn3 = async () => ({ id: 3 })

      const { results } = await batchRequest([fn1, fn2, fn3] as const)

      expect(results[0].data).toEqual({ id: 1 })
      expect(results[1].error).toBeDefined()
      expect(results[1].data).toBeNull()
      expect(results[2].data).toEqual({ id: 3 })
    })
  })

  describe('createDebouncedRequest - 防抖請求', () => {
    it('應該在指定時間後執行請求', async () => {
      const { createDebouncedRequest } = useApi()
      const mockFn = vi.fn().mockResolvedValue({ result: 'test' })

      const debouncedFn = createDebouncedRequest(mockFn, 300)

      const resultPromise = debouncedFn('arg1')

      expect(mockFn).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(300)

      const result = await resultPromise

      expect(mockFn).toHaveBeenCalledWith('arg1')
      expect(result.data).toEqual({ result: 'test' })
    })

    it('應該取消之前的請求', async () => {
      const { createDebouncedRequest } = useApi()
      const mockFn = vi.fn().mockResolvedValue({ result: 'test' })

      const debouncedFn = createDebouncedRequest(mockFn, 300)

      // 快速連續調用
      debouncedFn('call1')
      debouncedFn('call2')
      const lastPromise = debouncedFn('call3')

      await vi.advanceTimersByTimeAsync(300)
      await lastPromise

      // 只有最後一次調用應該執行
      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(mockFn).toHaveBeenCalledWith('call3')
    })

    it('應該使用預設 300ms 防抖時間', async () => {
      const { createDebouncedRequest } = useApi()
      const mockFn = vi.fn().mockResolvedValue({})

      const debouncedFn = createDebouncedRequest(mockFn)

      debouncedFn()

      await vi.advanceTimersByTimeAsync(299)
      expect(mockFn).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(mockFn).toHaveBeenCalled()
    })
  })

  describe('clearCache - 緩存清除', () => {
    it('應該清除所有緩存', async () => {
      const { request, clearCache } = useApi()

      const mockFn1 = vi.fn().mockResolvedValue({ id: 1 })
      const mockFn2 = vi.fn().mockResolvedValue({ id: 2 })

      await request(mockFn1, { cacheTTL: 5000, cacheKey: 'cache1' })
      await request(mockFn2, { cacheTTL: 5000, cacheKey: 'cache2' })

      clearCache()

      // 再次請求應該不從緩存返回
      const result = await request(mockFn1, { cacheTTL: 5000, cacheKey: 'cache1' })

      expect(result.fromCache).toBe(false)
    })

    it('應該清除指定鍵的緩存', async () => {
      const { request, clearCache } = useApi()

      const mockFn = vi.fn().mockResolvedValue({ id: 1 })

      await request(mockFn, { cacheTTL: 5000, cacheKey: 'specific-key' })

      clearCache('specific-key')

      const result = await request(mockFn, { cacheTTL: 5000, cacheKey: 'specific-key' })

      expect(result.fromCache).toBe(false)
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('應該支援通配符清除', async () => {
      const { request, clearCache } = useApi()

      const mockFn = vi.fn().mockResolvedValue({ id: 1 })

      await request(mockFn, { cacheTTL: 5000, cacheKey: 'members-list' })
      await request(mockFn, { cacheTTL: 5000, cacheKey: 'members-detail' })

      clearCache('members*')

      const result1 = await request(mockFn, { cacheTTL: 5000, cacheKey: 'members-list' })
      const result2 = await request(mockFn, { cacheTTL: 5000, cacheKey: 'members-detail' })

      expect(result1.fromCache).toBe(false)
      expect(result2.fromCache).toBe(false)
    })
  })

  describe('invalidateCache - 失效多個緩存鍵', () => {
    it('應該失效多個緩存鍵', async () => {
      const { request, invalidateCache } = useApi()

      const mockFn = vi.fn().mockResolvedValue({ id: 1 })

      await request(mockFn, { cacheTTL: 5000, cacheKey: 'members-1' })
      await request(mockFn, { cacheTTL: 5000, cacheKey: 'contracts-1' })

      invalidateCache([CACHE_KEYS.MEMBERS, CACHE_KEYS.CONTRACTS])

      const result1 = await request(mockFn, { cacheTTL: 5000, cacheKey: 'members-1' })
      const result2 = await request(mockFn, { cacheTTL: 5000, cacheKey: 'contracts-1' })

      expect(result1.fromCache).toBe(false)
      expect(result2.fromCache).toBe(false)
    })
  })

  describe('mutate - 變更操作', () => {
    it('應該執行變更並返回結果', async () => {
      const { mutate } = useApi()

      const result = await mutate(
        async () => ({ id: 'new-1', name: 'Created' }),
        [CACHE_KEYS.MEMBERS]
      )

      expect(result.data).toEqual({ id: 'new-1', name: 'Created' })
      expect(result.error).toBeNull()
    })

    it('應該在成功後失效相關緩存', async () => {
      const { request, mutate } = useApi()

      const mockFn = vi.fn().mockResolvedValue({ id: 1 })

      // 先建立緩存
      await request(mockFn, { cacheTTL: 5000, cacheKey: 'members-cache' })

      // 執行變更
      await mutate(
        async () => ({ success: true }),
        ['members']
      )

      // 再次請求應該不從緩存返回
      const result = await request(mockFn, { cacheTTL: 5000, cacheKey: 'members-cache' })

      expect(result.fromCache).toBe(false)
    })

    it('應該在失敗時不失效緩存', async () => {
      const { request, mutate } = useApi()

      const mockFn = vi.fn().mockResolvedValue({ id: 1 })

      // 先建立緩存
      await request(mockFn, { cacheTTL: 5000, cacheKey: 'keep-cache' })

      // 執行失敗的變更
      await mutate(
        async () => { throw new Error('Failed') },
        ['keep']
      )

      // 緩存應該還在
      const result = await request(mockFn, { cacheTTL: 5000, cacheKey: 'keep-cache' })

      expect(result.fromCache).toBe(true)
    })

    it('應該禁用去重和緩存', async () => {
      const { mutate } = useApi()

      let callCount = 0
      const mockFn = vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({ count: callCount })
      })

      // 同時執行兩個相同的變更
      const promise1 = mutate(mockFn, [])
      const promise2 = mutate(mockFn, [])

      const [result1, result2] = await Promise.all([promise1, promise2])

      expect(mockFn).toHaveBeenCalledTimes(2)
      expect(result1.data).toEqual({ count: 1 })
      expect(result2.data).toEqual({ count: 2 })
    })
  })

  describe('cancelPending - 取消進行中的請求', () => {
    it('應該清除所有進行中的請求', () => {
      const { cancelPending } = useApi()

      // 這個功能主要是清除 Map，沒有直接的可測試返回值
      expect(() => cancelPending()).not.toThrow()
    })

    it('應該清除指定的請求', () => {
      const { cancelPending } = useApi()

      expect(() => cancelPending('specific-key')).not.toThrow()
    })
  })
})
