/**
 * Comprehensive tests for useOfflineSync composable with real IndexedDB
 * Uses fake-indexeddb to test actual IndexedDB operations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

// Create mock state storage - fresh for each test
let stateStore: Map<string, { value: unknown }>

// Setup global mocks
vi.stubGlobal('navigator', { onLine: true })

vi.stubGlobal('useRuntimeConfig', () => ({
  public: { apiBaseUrl: 'http://localhost:8056' },
}))

vi.stubGlobal('useAuthTokens', () => ({
  getAuthHeader: () => ({ 'X-Member-Token': 'token123' }),
}))

vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, { value: init ? init() : undefined })
  }
  return stateStore.get(key)!
})

vi.stubGlobal('computed', (getter: () => unknown) => ({
  get value() {
    return getter()
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Import after mocks but with real indexedDB available
import { useOfflineSync } from './useOfflineSync'

describe('useOfflineSync with IndexedDB', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Create fresh state store for each test
    stateStore = new Map<string, { value: unknown }>()
    mockFetch.mockReset()

    // Reset navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })

    // Clean up queue and cache before each test
    const { clearQueue, clearCache } = useOfflineSync()
    await clearQueue()
    await clearCache()
  })

  describe('Queue Operations', () => {
    it('should queue a request successfully', async () => {
      const { queueRequest, pendingCount } = useOfflineSync()

      const requestId = await queueRequest({
        url: 'http://localhost:8056/api/member/test',
        method: 'POST',
        body: { data: 'test' },
        headers: { 'X-Member-Token': 'token123' },
        maxRetries: 3,
        type: 'booking',
      })

      expect(requestId).toBeDefined()
      expect(typeof requestId).toBe('string')
      expect(pendingCount.value).toBe(1)
    })

    it('should queue multiple requests', async () => {
      const { queueRequest, pendingCount, getPendingRequests } = useOfflineSync()

      await queueRequest({
        url: 'http://localhost:8056/api/member/test1',
        method: 'POST',
        maxRetries: 3,
        type: 'booking',
      })

      await queueRequest({
        url: 'http://localhost:8056/api/member/test2',
        method: 'DELETE',
        maxRetries: 3,
        type: 'booking',
      })

      expect(pendingCount.value).toBe(2)

      const pending = await getPendingRequests()
      expect(pending).toHaveLength(2)
    })

    it('should preserve request data', async () => {
      const { queueRequest, getPendingRequests } = useOfflineSync()

      const testData = { booking_id: 'b123', note: 'Test note' }
      await queueRequest({
        url: 'http://localhost:8056/api/member/test',
        method: 'POST',
        body: testData,
        headers: { 'X-Member-Token': 'token123' },
        maxRetries: 5,
        type: 'review',
        optimisticId: 'opt-123',
      })

      const pending = await getPendingRequests()
      expect(pending).toHaveLength(1)

      const request = pending[0]!
      expect(request.url).toBe('http://localhost:8056/api/member/test')
      expect(request.method).toBe('POST')
      expect(request.body).toEqual(testData)
      expect(request.headers).toEqual({ 'X-Member-Token': 'token123' })
      expect(request.maxRetries).toBe(5)
      expect(request.type).toBe('review')
      expect(request.optimisticId).toBe('opt-123')
      expect(request.retryCount).toBe(0)
    })

    it('should remove request from queue', async () => {
      const { queueRequest, removeFromQueue, pendingCount, getPendingRequests } = useOfflineSync()

      const requestId = await queueRequest({
        url: 'http://localhost:8056/api/member/test',
        method: 'POST',
        maxRetries: 3,
        type: 'booking',
      })

      expect(pendingCount.value).toBe(1)

      await removeFromQueue(requestId)

      expect(pendingCount.value).toBe(0)

      const pending = await getPendingRequests()
      expect(pending).toHaveLength(0)
    })

    it('should clear all queued requests', async () => {
      const { queueRequest, clearQueue, pendingCount, getPendingRequests } = useOfflineSync()

      await queueRequest({
        url: 'http://localhost:8056/api/member/test1',
        method: 'POST',
        maxRetries: 3,
        type: 'booking',
      })

      await queueRequest({
        url: 'http://localhost:8056/api/member/test2',
        method: 'DELETE',
        maxRetries: 3,
        type: 'booking',
      })

      expect(pendingCount.value).toBe(2)

      await clearQueue()

      expect(pendingCount.value).toBe(0)

      const pending = await getPendingRequests()
      expect(pending).toHaveLength(0)
    })
  })

  describe('Cache Operations', () => {
    it('should set and get cached data', async () => {
      const { setCache, getCache } = useOfflineSync()

      const testData = { id: 1, name: 'Test', items: [1, 2, 3] }
      await setCache('test-key', testData, 60000) // 1 minute TTL

      const cached = await getCache<typeof testData>('test-key')
      expect(cached).toEqual(testData)
    })

    it('should return null for non-existent cache key', async () => {
      const { getCache } = useOfflineSync()

      const result = await getCache('non-existent-key')
      expect(result).toBeNull()
    })

    it('should return null for expired cache', async () => {
      const { setCache, getCache } = useOfflineSync()

      await setCache('expired-key', { data: 'test' }, 1) // 1ms TTL

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10))

      const result = await getCache('expired-key')
      expect(result).toBeNull()
    })

    it('should delete specific cache entry', async () => {
      const { setCache, getCache, deleteCache } = useOfflineSync()

      await setCache('key-to-delete', { data: 'test' })

      // Verify it's cached
      let cached = await getCache('key-to-delete')
      expect(cached).toEqual({ data: 'test' })

      await deleteCache('key-to-delete')

      cached = await getCache('key-to-delete')
      expect(cached).toBeNull()
    })

    it('should clear all cache', async () => {
      const { setCache, getCache, clearCache } = useOfflineSync()

      await setCache('key1', { data: 1 })
      await setCache('key2', { data: 2 })
      await setCache('key3', { data: 3 })

      // Verify all cached
      expect(await getCache('key1')).toEqual({ data: 1 })
      expect(await getCache('key2')).toEqual({ data: 2 })
      expect(await getCache('key3')).toEqual({ data: 3 })

      await clearCache()

      expect(await getCache('key1')).toBeNull()
      expect(await getCache('key2')).toBeNull()
      expect(await getCache('key3')).toBeNull()
    })
  })

  describe('Sync Operations', () => {
    it('should sync pending requests when online', async () => {
      const { queueRequest, syncPendingRequests, pendingCount, isOnline } = useOfflineSync()

      isOnline.value = true
      mockFetch.mockResolvedValue({ success: true })

      await queueRequest({
        url: 'http://localhost:8056/api/member/test',
        method: 'POST',
        body: { data: 'test' },
        maxRetries: 3,
        type: 'booking',
      })

      expect(pendingCount.value).toBe(1)

      const result = await syncPendingRequests()

      expect(result.success).toBe(true)
      expect(result.synced).toBe(1)
      expect(result.failed).toBe(0)
      expect(pendingCount.value).toBe(0)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should not sync when offline', async () => {
      const { queueRequest, syncPendingRequests, pendingCount, isOnline } = useOfflineSync()

      isOnline.value = false

      await queueRequest({
        url: 'http://localhost:8056/api/member/test',
        method: 'POST',
        maxRetries: 3,
        type: 'booking',
      })

      const result = await syncPendingRequests()

      expect(result.success).toBe(false)
      expect(result.synced).toBe(0)
      expect(pendingCount.value).toBe(1)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should handle sync failures and retry', async () => {
      const { queueRequest, syncPendingRequests, getPendingRequests, isOnline } = useOfflineSync()

      isOnline.value = true
      mockFetch.mockRejectedValue(new Error('Network error'))

      await queueRequest({
        url: 'http://localhost:8056/api/member/test',
        method: 'POST',
        maxRetries: 3,
        type: 'booking',
      })

      const result = await syncPendingRequests()

      expect(result.success).toBe(false)
      expect(result.failed).toBe(1)

      // Request should still be in queue with incremented retry count
      const pending = await getPendingRequests()
      expect(pending).toHaveLength(1)
      expect(pending[0]!.retryCount).toBe(1)
    })

    it('should remove request after max retries', async () => {
      const { queueRequest, syncPendingRequests, getPendingRequests, isOnline } = useOfflineSync()

      isOnline.value = true
      mockFetch.mockRejectedValue(new Error('Network error'))

      await queueRequest({
        url: 'http://localhost:8056/api/member/test',
        method: 'POST',
        maxRetries: 1, // Only 1 retry allowed
        type: 'booking',
      })

      // First sync - retryCount becomes 1
      await syncPendingRequests()

      // After reaching maxRetries, request should be removed on next sync
      let pending = await getPendingRequests()
      expect(pending).toHaveLength(1)
      expect(pending[0]!.retryCount).toBe(1)

      // Second sync - should be removed due to max retries reached
      const result = await syncPendingRequests()
      expect(result.failed).toBe(1)

      pending = await getPendingRequests()
      expect(pending).toHaveLength(0)
    })

    it('should sync multiple requests in order', async () => {
      const { queueRequest, syncPendingRequests, pendingCount, isOnline } = useOfflineSync()

      isOnline.value = true
      mockFetch.mockResolvedValue({ success: true })

      await queueRequest({
        url: 'http://localhost:8056/api/member/test1',
        method: 'POST',
        maxRetries: 3,
        type: 'booking',
      })

      await queueRequest({
        url: 'http://localhost:8056/api/member/test2',
        method: 'DELETE',
        maxRetries: 3,
        type: 'booking',
      })

      await queueRequest({
        url: 'http://localhost:8056/api/member/test3',
        method: 'POST',
        maxRetries: 3,
        type: 'review',
      })

      expect(pendingCount.value).toBe(3)

      const result = await syncPendingRequests()

      expect(result.success).toBe(true)
      expect(result.synced).toBe(3)
      expect(pendingCount.value).toBe(0)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('High-level Helpers', () => {
    it('should queue booking cancellation', async () => {
      const { queueCancelBooking, getPendingRequests } = useOfflineSync()

      const requestId = await queueCancelBooking(
        'booking-123',
      )

      expect(requestId).toBeDefined()

      const pending = await getPendingRequests()
      expect(pending).toHaveLength(1)
      expect(pending[0]!.url).toBe('http://localhost:8056/api/member/bookings/booking-123')
      expect(pending[0]!.method).toBe('DELETE')
      expect(pending[0]!.type).toBe('booking')
      expect(pending[0]!.optimisticId).toBe('booking-123')
    })

    it('should queue review submission', async () => {
      const { queueSubmitReview, getPendingRequests } = useOfflineSync()

      const reviewPayload = {
        booking_id: 'b123',
        rating: 5,
        comment: 'Great class!',
      }

      const requestId = await queueSubmitReview(
        reviewPayload,
      )

      expect(requestId).toBeDefined()

      const pending = await getPendingRequests()
      expect(pending).toHaveLength(1)
      expect(pending[0]!.url).toBe('http://localhost:8056/api/member/reviews')
      expect(pending[0]!.method).toBe('POST')
      expect(pending[0]!.body).toEqual(reviewPayload)
      expect(pending[0]!.type).toBe('review')
      expect(pending[0]!.optimisticId).toBe('b123')
    })
  })

  describe('Status Labels', () => {
    it('should show correct label when synced', () => {
      const { syncStatusLabel, isOnline, pendingCount, isSyncing } = useOfflineSync()
      isOnline.value = true
      pendingCount.value = 0
      isSyncing.value = false

      expect(syncStatusLabel.value).toBe('已同步')
    })

    it('should show correct label when offline', () => {
      const { syncStatusLabel, isOnline } = useOfflineSync()
      isOnline.value = false

      expect(syncStatusLabel.value).toBe('離線模式')
    })

    it('should show correct label when syncing', () => {
      const { syncStatusLabel, isSyncing } = useOfflineSync()
      isSyncing.value = true

      expect(syncStatusLabel.value).toBe('同步中...')
    })

    it('should show pending count in label', () => {
      const { syncStatusLabel, isOnline, pendingCount, isSyncing } = useOfflineSync()
      isOnline.value = true
      pendingCount.value = 5
      isSyncing.value = false

      expect(syncStatusLabel.value).toBe('5 項待同步')
    })
  })
})
