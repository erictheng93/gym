/**
 * Tests for coach-app debounce utilities
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
      vi.useRealTimers()

      let callCount = 0
      const requestFn = vi.fn(() => {
        callCount++
        return Promise.resolve(`result-${callCount}`)
      })

      const promise1 = deduplicateRequest('key1', requestFn)
      const promise2 = deduplicateRequest('key1', requestFn)

      const [res1, res2] = await Promise.all([promise1, promise2])

      expect(callCount).toBe(1)
      expect(res1).toBe('result-1')
      expect(res2).toBe('result-1')
    })

    it('should allow subsequent requests after completion', async () => {
      vi.useRealTimers()

      let callCount = 0
      const requestFn = vi.fn(() => {
        callCount++
        return Promise.resolve(`result-${callCount}`)
      })

      await deduplicateRequest('key2', requestFn)
      await deduplicateRequest('key2', requestFn)

      expect(callCount).toBe(2)
    })
  })

  describe('memoizeAsync', () => {
    it('should return cached result within TTL', async () => {
      vi.useRealTimers()

      let callCount = 0
      const fetchFn = async (id: string) => {
        callCount++
        return { id, count: callCount }
      }

      const memoized = memoizeAsync(fetchFn, { ttl: 500 })

      const res1 = await memoized('item1')
      const res2 = await memoized('item1')

      expect(callCount).toBe(1)
      expect(res1).toEqual(res2)
    })
  })
})
