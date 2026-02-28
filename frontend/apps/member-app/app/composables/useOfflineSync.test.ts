/**
 * Tests for useOfflineSync composable
 *
 * Note: IndexedDB operations are tested for basic functionality.
 * Full IndexedDB testing requires a proper fake-indexeddb library
 * or browser-based E2E tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create mock state storage
const stateStore = new Map<string, { value: unknown }>()

// Mock globals - simplified without actual IndexedDB
vi.stubGlobal('indexedDB', undefined) // Disable IndexedDB for simpler testing
vi.stubGlobal('navigator', { onLine: true })

vi.stubGlobal('useRuntimeConfig', () => ({
  public: { apiBaseUrl: 'http://localhost:8056' },
}))

vi.stubGlobal('useAuthTokens', () => ({
  getAuthHeader: () => ({ 'X-Member-Token': 'test' }),
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

// Import after mocks
import { useOfflineSync } from './useOfflineSync'

describe('useOfflineSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    mockFetch.mockReset()
    // Reset navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    })
  })

  describe('isOnline', () => {
    it('should return true when navigator is online', () => {
      const { isOnline } = useOfflineSync()
      expect(isOnline.value).toBe(true)
    })

    it('should return false when navigator is offline', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      })
      stateStore.clear() // Clear to reinitialize state
      const { isOnline } = useOfflineSync()
      expect(isOnline.value).toBe(false)
    })
  })

  describe('initial state', () => {
    it('should have pendingCount of 0 initially', () => {
      const { pendingCount } = useOfflineSync()
      expect(pendingCount.value).toBe(0)
    })

    it('should not be syncing initially', () => {
      const { isSyncing } = useOfflineSync()
      expect(isSyncing.value).toBe(false)
    })

    it('should have null lastSyncAt initially', () => {
      const { lastSyncAt } = useOfflineSync()
      expect(lastSyncAt.value).toBeNull()
    })
  })

  describe('hasPendingRequests', () => {
    it('should return false when no pending requests', () => {
      const { hasPendingRequests } = useOfflineSync()
      expect(hasPendingRequests.value).toBe(false)
    })

    it('should return true when there are pending requests', () => {
      const { hasPendingRequests, pendingCount } = useOfflineSync()
      pendingCount.value = 3
      expect(hasPendingRequests.value).toBe(true)
    })
  })

  describe('syncStatusLabel', () => {
    it('should show "已同步" when online with no pending', () => {
      const { syncStatusLabel, isOnline, pendingCount, isSyncing } = useOfflineSync()
      isOnline.value = true
      pendingCount.value = 0
      isSyncing.value = false
      expect(syncStatusLabel.value).toBe('已同步')
    })

    it('should show "離線模式" when offline', () => {
      const { syncStatusLabel, isOnline } = useOfflineSync()
      isOnline.value = false
      expect(syncStatusLabel.value).toBe('離線模式')
    })

    it('should show "同步中..." when syncing', () => {
      const { syncStatusLabel, isSyncing } = useOfflineSync()
      isSyncing.value = true
      expect(syncStatusLabel.value).toBe('同步中...')
    })

    it('should show pending count when there are pending requests', () => {
      const { syncStatusLabel, isOnline, pendingCount, isSyncing } = useOfflineSync()
      isOnline.value = true
      pendingCount.value = 5
      isSyncing.value = false
      expect(syncStatusLabel.value).toBe('5 項待同步')
    })
  })

  describe('syncPendingRequests', () => {
    it('should not sync when offline', async () => {
      const { syncPendingRequests, isOnline } = useOfflineSync()
      isOnline.value = false

      const result = await syncPendingRequests()

      expect(result.success).toBe(false)
      expect(result.synced).toBe(0)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should not sync when already syncing', async () => {
      const { syncPendingRequests, isSyncing } = useOfflineSync()
      isSyncing.value = true

      const result = await syncPendingRequests()

      expect(result.success).toBe(false)
      expect(result.synced).toBe(0)
    })
  })

  describe('cache operations (without IndexedDB)', () => {
    it('should return null when IndexedDB is not available', async () => {
      const { getCache } = useOfflineSync()
      const result = await getCache('any-key')
      expect(result).toBeNull()
    })

    it('should not throw when setting cache without IndexedDB', async () => {
      const { setCache } = useOfflineSync()
      // Should not throw
      await setCache('key', 'value')
      expect(true).toBe(true)
    })

    it('should not throw when clearing cache without IndexedDB', async () => {
      const { clearCache } = useOfflineSync()
      // Should not throw
      await clearCache()
      expect(true).toBe(true)
    })

    it('should not throw when deleting cache without IndexedDB', async () => {
      const { deleteCache } = useOfflineSync()
      // Should not throw
      await deleteCache('key')
      expect(true).toBe(true)
    })
  })

  describe('queue operations (without IndexedDB)', () => {
    it('should reject queueRequest when IndexedDB is not available', async () => {
      const { queueRequest } = useOfflineSync()

      await expect(queueRequest({
        url: 'http://example.com/api',
        method: 'POST',
        maxRetries: 3,
        type: 'other',
      })).rejects.toThrow('IndexedDB not available')
    })

    it('should reject queueCancelBooking when IndexedDB is not available', async () => {
      const { queueCancelBooking } = useOfflineSync()

      await expect(queueCancelBooking(
        'booking-123',
      )).rejects.toThrow('IndexedDB not available')
    })

    it('should reject queueSubmitReview when IndexedDB is not available', async () => {
      const { queueSubmitReview } = useOfflineSync()

      await expect(queueSubmitReview(
        { booking_id: 'b1', rating: 5 },
      )).rejects.toThrow('IndexedDB not available')
    })
  })

  describe('setupListeners', () => {
    it('should not throw when called', () => {
      const { setupListeners } = useOfflineSync()
      // Should not throw
      expect(() => setupListeners()).not.toThrow()
    })
  })

  describe('clearQueue', () => {
    it('should not throw when IndexedDB is not available', async () => {
      const { clearQueue } = useOfflineSync()
      // Should not throw
      await clearQueue()
      expect(true).toBe(true)
    })
  })

  describe('getPendingRequests', () => {
    it('should reject when IndexedDB is not available', async () => {
      const { getPendingRequests } = useOfflineSync()

      await expect(getPendingRequests()).rejects.toThrow('IndexedDB not available')
    })
  })

  describe('loadPendingCount', () => {
    it('should be called by setupListeners without error', () => {
      const { setupListeners } = useOfflineSync()
      // setupListeners calls loadPendingCount internally
      expect(() => setupListeners()).not.toThrow()
    })
  })

  describe('workout queue helpers', () => {
    it('should reject queueCreateWorkout when IndexedDB is not available', async () => {
      const { queueCreateWorkout } = useOfflineSync()

      await expect(queueCreateWorkout(
        { date: '2024-01-15', duration: 60 },
      )).rejects.toThrow('IndexedDB not available')
    })

    it('should reject queueUpdateWorkout when IndexedDB is not available', async () => {
      const { queueUpdateWorkout } = useOfflineSync()

      await expect(queueUpdateWorkout(
        'workout-123',
        { duration: 90 },
      )).rejects.toThrow('IndexedDB not available')
    })

    it('should reject queueDeleteWorkout when IndexedDB is not available', async () => {
      const { queueDeleteWorkout } = useOfflineSync()

      await expect(queueDeleteWorkout(
        'workout-123',
      )).rejects.toThrow('IndexedDB not available')
    })
  })
})
