/**
 * Tests for debounce utilities
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce, throttle, deduplicateRequest, memoizeAsync } from './debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('debounce function', () => {
    it('should delay function execution', () => {
      const fn = vi.fn()
      const debouncedFn = debounce(fn, 100)

      debouncedFn()
      expect(fn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should reset delay on subsequent calls', () => {
      const fn = vi.fn()
      const debouncedFn = debounce(fn, 100)

      debouncedFn()
      vi.advanceTimersByTime(50)

      debouncedFn()
      vi.advanceTimersByTime(50)
      expect(fn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(50)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should pass arguments to the function', () => {
      const fn = vi.fn()
      const debouncedFn = debounce(fn, 100)

      debouncedFn('arg1', 'arg2')
      vi.advanceTimersByTime(100)

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2')
    })
  })

  describe('throttle function', () => {
    it('should execute immediately on first call', () => {
      const fn = vi.fn()
      const throttledFn = throttle(fn, 100)

      throttledFn()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should throttle subsequent calls', () => {
      const fn = vi.fn()
      const throttledFn = throttle(fn, 100)

      throttledFn()
      throttledFn()
      throttledFn()

      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should allow calls after limit expires', () => {
      const fn = vi.fn()
      const throttledFn = throttle(fn, 100)

      throttledFn()
      expect(fn).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(100)

      throttledFn()
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  describe('deduplicateRequest', () => {
    it('should only call request function once for concurrent requests', async () => {
      vi.useRealTimers() // Use real timers for async tests

      let callCount = 0
      const requestFn = vi.fn(() => {
        callCount++
        return Promise.resolve(`result-${callCount}`)
      })

      const promise1 = deduplicateRequest('key1', requestFn)
      const promise2 = deduplicateRequest('key1', requestFn)

      // Request function should only be called once
      expect(requestFn).toHaveBeenCalledTimes(1)

      const [result1, result2] = await Promise.all([promise1, promise2])

      // Both should return the same result
      expect(result1).toBe('result-1')
      expect(result2).toBe('result-1')

      vi.useFakeTimers() // Restore fake timers
    })

    it('should create new request after previous completes', async () => {
      let callCount = 0
      const requestFn = vi.fn(() => {
        callCount++
        return Promise.resolve(`result-${callCount}`)
      })

      const result1 = await deduplicateRequest('key2', requestFn)
      expect(result1).toBe('result-1')

      const result2 = await deduplicateRequest('key2', requestFn)
      expect(result2).toBe('result-2')

      expect(requestFn).toHaveBeenCalledTimes(2)
    })

    it('should handle different keys separately', async () => {
      const requestFn = vi.fn((key: string) => Promise.resolve(key))

      const promise1 = deduplicateRequest('key-a', () => requestFn('a'))
      const promise2 = deduplicateRequest('key-b', () => requestFn('b'))

      expect(promise1).not.toBe(promise2)

      const [result1, result2] = await Promise.all([promise1, promise2])

      expect(result1).toBe('a')
      expect(result2).toBe('b')
    })

    it('should clean up after request fails', async () => {
      let callCount = 0
      const requestFn = vi.fn(() => {
        callCount++
        if (callCount === 1) {
          return Promise.reject(new Error('first error'))
        }
        return Promise.resolve('success')
      })

      try {
        await deduplicateRequest('key3', requestFn)
      } catch {
        // Expected
      }

      // After failure, should be able to make new request
      const result = await deduplicateRequest('key3', requestFn)
      expect(result).toBe('success')
    })
  })

  describe('memoizeAsync', () => {
    it('should cache successful results', async () => {
      const fn = vi.fn(async (x: number) => {
        return x * 2
      })

      const memoizedFn = memoizeAsync(fn, { ttl: 1000 })

      const result1 = await memoizedFn(5)
      const result2 = await memoizedFn(5)

      expect(result1).toBe(10)
      expect(result2).toBe(10)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should refresh cache after TTL expires', async () => {
      let callCount = 0
      const fn = vi.fn(async () => {
        callCount++
        return callCount
      })

      const memoizedFn = memoizeAsync(fn, { ttl: 100 })

      const result1 = await memoizedFn()
      expect(result1).toBe(1)

      vi.advanceTimersByTime(150)

      const result2 = await memoizedFn()
      expect(result2).toBe(2)
    })

    it('should use custom key generator', async () => {
      const fn = vi.fn(async (obj: { id: number }) => obj.id * 2)

      const memoizedFn = memoizeAsync(fn, {
        ttl: 1000,
        keyGenerator: (obj) => `id-${obj.id}`,
      })

      await memoizedFn({ id: 1 })
      await memoizedFn({ id: 1 })

      expect(fn).toHaveBeenCalledTimes(1)

      await memoizedFn({ id: 2 })

      expect(fn).toHaveBeenCalledTimes(2)
    })
  })
})
