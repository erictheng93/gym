/**
 * Unit tests for API Helper Utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractErrorMessage,
  withRetry,
  debounceAsync,
  throttleAsync,
  delay,
  type ApiResult,
} from './apiHelpers'

describe('apiHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('extractErrorMessage', () => {
    it('should return fallback for null/undefined errors', () => {
      expect(extractErrorMessage(null, 'fallback')).toBe('fallback')
      expect(extractErrorMessage(undefined, 'fallback')).toBe('fallback')
    })

    it('should return string errors directly', () => {
      expect(extractErrorMessage('Custom error', 'fallback')).toBe('Custom error')
    })

    it('should extract message from Error object', () => {
      const error = new Error('Error message')
      expect(extractErrorMessage(error, 'fallback')).toBe('Error message')
    })

    it('should extract message from $fetch error with data.message', () => {
      const fetchError = {
        data: { message: 'API error message' },
      }
      expect(extractErrorMessage(fetchError, 'fallback')).toBe('API error message')
    })

    it('should extract direct message property', () => {
      const error = { message: 'Direct message' }
      expect(extractErrorMessage(error, 'fallback')).toBe('Direct message')
    })

    it('should extract statusMessage (Nuxt error format)', () => {
      const nuxtError = { statusMessage: 'Status message' }
      expect(extractErrorMessage(nuxtError, 'fallback')).toBe('Status message')
    })

    it('should prefer data.message over direct message', () => {
      const error = {
        data: { message: 'Data message' },
        message: 'Direct message',
      }
      expect(extractErrorMessage(error, 'fallback')).toBe('Data message')
    })

    it('should return fallback for empty Error object', () => {
      const error = new Error('')
      expect(extractErrorMessage(error, 'fallback')).toBe('fallback')
    })

    it('should return fallback for unknown object structure', () => {
      const error = { foo: 'bar' }
      expect(extractErrorMessage(error, 'fallback')).toBe('fallback')
    })
  })

  describe('withRetry', () => {
    it('should succeed on first attempt without retrying', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withRetry(fn, { maxRetries: 3 })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry and eventually succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success')

      // Use minimal backoff for fast tests
      const result = await withRetry(fn, { maxRetries: 3, backoffMs: 1, maxBackoffMs: 10 })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should throw after max retries exhausted', async () => {
      const error = new Error('persistent failure')
      const fn = vi.fn().mockRejectedValue(error)

      await expect(
        withRetry(fn, { maxRetries: 3, backoffMs: 1, maxBackoffMs: 10 })
      ).rejects.toThrow('persistent failure')

      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should call onRetry callback on each retry', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success')

      const onRetry = vi.fn()

      await withRetry(fn, { maxRetries: 3, backoffMs: 1, maxBackoffMs: 10, onRetry })

      expect(onRetry).toHaveBeenCalledTimes(2)
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error))
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error))
    })

    it('should not retry 4xx errors by default (except specific codes)', async () => {
      const fn = vi.fn().mockRejectedValue({ statusCode: 400 })

      await expect(withRetry(fn, { maxRetries: 3 })).rejects.toEqual({ statusCode: 400 })
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry 429 (rate limit) errors', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ statusCode: 429 })
        .mockResolvedValue('success')

      const result = await withRetry(fn, { maxRetries: 3, backoffMs: 1, maxBackoffMs: 10 })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should retry 5xx errors', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce({ statusCode: 500 })
        .mockResolvedValue('success')

      const result = await withRetry(fn, { maxRetries: 3, backoffMs: 1, maxBackoffMs: 10 })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should respect maxBackoffMs limit', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success')

      // Even with 5000ms base, max should cap at 100ms
      const start = Date.now()
      const result = await withRetry(fn, {
        maxRetries: 3,
        backoffMs: 5000,
        maxBackoffMs: 100,
      })
      const elapsed = Date.now() - start

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
      // Should complete in ~200ms max (100ms * 2 retries + jitter), not 15000ms
      expect(elapsed).toBeLessThan(500)
    })
  })

  describe('delay', () => {
    it('should resolve after specified time', async () => {
      vi.useFakeTimers()

      let resolved = false
      const promise = delay(100).then(() => {
        resolved = true
      })

      expect(resolved).toBe(false)

      await vi.advanceTimersByTimeAsync(100)
      await promise

      expect(resolved).toBe(true)
    })
  })

  describe('debounceAsync', () => {
    it('should debounce rapid calls', async () => {
      vi.useFakeTimers()

      const fn = vi.fn().mockResolvedValue('result')
      const debounced = debounceAsync(fn, 100)

      // Make rapid calls
      debounced()
      debounced()
      debounced()

      // Function should not be called yet
      expect(fn).not.toHaveBeenCalled()

      // Fast-forward past debounce delay
      await vi.advanceTimersByTimeAsync(100)

      // Should only be called once
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should return same promise for rapid calls', async () => {
      vi.useFakeTimers()

      const fn = vi.fn().mockResolvedValue('result')
      const debounced = debounceAsync(fn, 100)

      const promise1 = debounced()
      const promise2 = debounced()
      const promise3 = debounced()

      expect(promise1).toBe(promise2)
      expect(promise2).toBe(promise3)

      await vi.advanceTimersByTimeAsync(100)

      const result = await promise1
      expect(result).toBe('result')
    })
  })

  describe('throttleAsync', () => {
    it('should throttle calls within time window', async () => {
      vi.useFakeTimers()

      const fn = vi.fn().mockResolvedValue('result')
      const throttled = throttleAsync(fn, 100)

      // First call should go through
      const result1 = await throttled()
      expect(result1).toBe('result')
      expect(fn).toHaveBeenCalledTimes(1)

      // Immediate second call should return null
      const result2 = await throttled()
      expect(result2).toBe(null)
      expect(fn).toHaveBeenCalledTimes(1)

      // After throttle window, call should work again
      await vi.advanceTimersByTimeAsync(100)
      const result3 = await throttled()
      expect(result3).toBe('result')
      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  describe('ApiResult type', () => {
    it('should allow creating success results', () => {
      const result: ApiResult<string> = {
        success: true,
        message: 'Success',
        data: 'some data',
      }

      expect(result.success).toBe(true)
      expect(result.data).toBe('some data')
    })

    it('should allow creating error results without data', () => {
      const result: ApiResult = {
        success: false,
        message: 'Error occurred',
      }

      expect(result.success).toBe(false)
      expect(result.data).toBeUndefined()
    })
  })
})
