/**
 * useOfflineSync composable
 * Provides offline capabilities with IndexedDB caching and request queuing
 * Adapted from member-app for coach-app attendance operations
 */

const DB_NAME = 'gym-nexus-coach'
const DB_VERSION = 1
const STORES = {
  cache: 'cache',
  queue: 'pending_requests',
} as const

export interface QueuedRequest {
  id: string
  url: string
  method: 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  timestamp: number
  retryCount: number
  maxRetries: number
  type: 'attendance' | 'cancel_class' | 'other'
  optimisticId?: string
  description?: string
}

export interface CacheEntry<T = unknown> {
  key: string
  data: T
  timestamp: number
  expiresAt: number
}

interface SyncResult {
  success: boolean
  synced: number
  failed: number
  errors: Array<{ id: string; error: string }>
}

let dbInstance: IDBDatabase | null = null

/**
 * Initialize IndexedDB
 */
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance)
      return
    }

    // Check if IndexedDB is available (may not be in SSR)
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)

    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Cache store for API responses
      if (!db.objectStoreNames.contains(STORES.cache)) {
        db.createObjectStore(STORES.cache, { keyPath: 'key' })
      }

      // Queue store for pending requests
      if (!db.objectStoreNames.contains(STORES.queue)) {
        const queueStore = db.createObjectStore(STORES.queue, { keyPath: 'id' })
        queueStore.createIndex('timestamp', 'timestamp', { unique: false })
        queueStore.createIndex('type', 'type', { unique: false })
      }
    }
  })
}

export const useOfflineSync = () => {
  // Online status - use reactive ref for SSR compatibility
  const isOnline = useState<boolean>('coach_offline_sync_online', () =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const pendingCount = useState<number>('coach_offline_sync_pending_count', () => 0)
  const isSyncing = useState<boolean>('coach_offline_sync_syncing', () => false)
  const lastSyncAt = useState<number | null>('coach_offline_sync_last', () => null)

  /**
   * Set up online/offline listeners (client-side only)
   */
  const setupListeners = () => {
    if (typeof window === 'undefined') return

    const updateOnlineStatus = () => {
      isOnline.value = navigator.onLine
    }

    window.addEventListener('online', () => {
      updateOnlineStatus()
      // Auto-sync when coming back online
      syncPendingRequests()
    })
    window.addEventListener('offline', updateOnlineStatus)

    // Initial status
    updateOnlineStatus()
    // Load pending count
    loadPendingCount()
  }

  /**
   * Load count of pending requests from IndexedDB
   */
  const loadPendingCount = async () => {
    try {
      const db = await initDB()
      const tx = db.transaction(STORES.queue, 'readonly')
      const store = tx.objectStore(STORES.queue)
      const countRequest = store.count()

      countRequest.onsuccess = () => {
        pendingCount.value = countRequest.result
      }
    } catch {
      // IndexedDB not available (SSR or unsupported browser)
    }
  }

  /**
   * Generate unique ID for queued requests
   */
  const generateId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }

  /**
   * Add a request to the offline queue
   */
  const queueRequest = async (
    request: Omit<QueuedRequest, 'id' | 'timestamp' | 'retryCount'>
  ): Promise<string> => {
    const db = await initDB()
    const queuedRequest: QueuedRequest = {
      ...request,
      id: generateId(),
      timestamp: Date.now(),
      retryCount: 0,
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.queue, 'readwrite')
      const store = tx.objectStore(STORES.queue)
      const addRequest = store.add(queuedRequest)

      addRequest.onsuccess = () => {
        pendingCount.value++
        resolve(queuedRequest.id)
      }
      addRequest.onerror = () => reject(addRequest.error)
    })
  }

  /**
   * Remove a request from the queue
   */
  const removeFromQueue = async (id: string): Promise<void> => {
    const db = await initDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.queue, 'readwrite')
      const store = tx.objectStore(STORES.queue)
      const deleteRequest = store.delete(id)

      deleteRequest.onsuccess = () => {
        pendingCount.value = Math.max(0, pendingCount.value - 1)
        resolve()
      }
      deleteRequest.onerror = () => reject(deleteRequest.error)
    })
  }

  /**
   * Get all pending requests
   */
  const getPendingRequests = async (): Promise<QueuedRequest[]> => {
    const db = await initDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.queue, 'readonly')
      const store = tx.objectStore(STORES.queue)
      const index = store.index('timestamp')
      const request = index.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Execute a single request
   */
  const executeRequest = async (request: QueuedRequest): Promise<boolean> => {
    try {
      await $fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body as Record<string, unknown> | undefined,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Update retry count for a failed request
   */
  const updateRetryCount = async (request: QueuedRequest): Promise<void> => {
    const db = await initDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.queue, 'readwrite')
      const store = tx.objectStore(STORES.queue)
      const updatedRequest = { ...request, retryCount: request.retryCount + 1 }
      const putRequest = store.put(updatedRequest)

      putRequest.onsuccess = () => resolve()
      putRequest.onerror = () => reject(putRequest.error)
    })
  }

  /**
   * Sync all pending requests
   */
  const syncPendingRequests = async (): Promise<SyncResult> => {
    if (!isOnline.value || isSyncing.value) {
      return { success: false, synced: 0, failed: 0, errors: [] }
    }

    isSyncing.value = true
    const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] }

    try {
      const pending = await getPendingRequests()

      for (const request of pending) {
        if (request.retryCount >= request.maxRetries) {
          // Max retries reached, remove from queue
          await removeFromQueue(request.id)
          result.failed++
          result.errors.push({
            id: request.id,
            error: '已達最大重試次數',
          })
          continue
        }

        const success = await executeRequest(request)

        if (success) {
          await removeFromQueue(request.id)
          result.synced++
        } else {
          await updateRetryCount(request)
          result.failed++
          result.errors.push({
            id: request.id,
            error: '同步失敗，將稍後重試',
          })
        }
      }

      lastSyncAt.value = Date.now()
      result.success = result.failed === 0
    } catch (error) {
      result.success = false
      result.errors.push({
        id: 'sync',
        error: error instanceof Error ? error.message : '同步過程發生錯誤',
      })
    } finally {
      isSyncing.value = false
    }

    return result
  }

  // ===================
  // Cache Management
  // ===================

  /**
   * Get cached data
   */
  const getCache = async <T>(key: string): Promise<T | null> => {
    try {
      const db = await initDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.cache, 'readonly')
        const store = tx.objectStore(STORES.cache)
        const request = store.get(key)

        request.onsuccess = () => {
          const entry = request.result as CacheEntry<T> | undefined
          if (!entry) {
            resolve(null)
            return
          }

          // Check expiration
          if (entry.expiresAt < Date.now()) {
            // Cache expired, delete and return null
            deleteCache(key)
            resolve(null)
            return
          }

          resolve(entry.data)
        }
        request.onerror = () => reject(request.error)
      })
    } catch {
      return null
    }
  }

  /**
   * Set cached data with TTL
   */
  const setCache = async <T>(
    key: string,
    data: T,
    ttlMs: number = 5 * 60 * 1000 // Default 5 minutes
  ): Promise<void> => {
    try {
      const db = await initDB()
      const entry: CacheEntry<T> = {
        key,
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttlMs,
      }

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.cache, 'readwrite')
        const store = tx.objectStore(STORES.cache)
        const request = store.put(entry)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch {
      // Ignore cache errors
    }
  }

  /**
   * Delete cached data
   */
  const deleteCache = async (key: string): Promise<void> => {
    try {
      const db = await initDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.cache, 'readwrite')
        const store = tx.objectStore(STORES.cache)
        const request = store.delete(key)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch {
      // Ignore cache errors
    }
  }

  /**
   * Clear all cache
   */
  const clearCache = async (): Promise<void> => {
    try {
      const db = await initDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.cache, 'readwrite')
        const store = tx.objectStore(STORES.cache)
        const request = store.clear()

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch {
      // Ignore cache errors
    }
  }

  /**
   * Clear all pending requests
   */
  const clearQueue = async (): Promise<void> => {
    try {
      const db = await initDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.queue, 'readwrite')
        const store = tx.objectStore(STORES.queue)
        const request = store.clear()

        request.onsuccess = () => {
          pendingCount.value = 0
          resolve()
        }
        request.onerror = () => reject(request.error)
      })
    } catch {
      // Ignore errors
    }
  }

  // ===================
  // High-level API helpers for attendance operations
  // ===================

  /**
   * Queue an attendance mark for offline sync
   */
  const queueMarkAttendance = async (
    bookingId: string,
    data: { attended: boolean; notes?: string; class_record?: Record<string, unknown> },
    apiUrl: string,
    headers: Record<string, string>
  ): Promise<string> => {
    return queueRequest({
      url: `${apiUrl}/api/coach/classes/${bookingId}/attendance`,
      method: 'POST',
      headers,
      body: data,
      maxRetries: 3,
      type: 'attendance',
      optimisticId: bookingId,
      description: data.attended ? '標記出席' : '標記未到',
    })
  }

  /**
   * Queue a class cancellation for offline sync
   */
  const queueCancelClass = async (
    sessionId: string,
    reason: string,
    apiUrl: string,
    headers: Record<string, string>
  ): Promise<string> => {
    return queueRequest({
      url: `${apiUrl}/api/coach/classes/${sessionId}/cancel`,
      method: 'POST',
      headers,
      body: { reason },
      maxRetries: 3,
      type: 'cancel_class',
      optimisticId: sessionId,
      description: '取消課程',
    })
  }

  // ===================
  // Computed properties
  // ===================

  const hasPendingRequests = computed(() => pendingCount.value > 0)

  const syncStatusLabel = computed(() => {
    if (isSyncing.value) return '同步中...'
    if (!isOnline.value) return '離線模式'
    if (hasPendingRequests.value) return `${pendingCount.value} 項待同步`
    return '已同步'
  })

  return {
    // State
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncAt,
    hasPendingRequests,
    syncStatusLabel,

    // Setup
    setupListeners,

    // Queue operations
    queueRequest,
    removeFromQueue,
    getPendingRequests,
    syncPendingRequests,
    clearQueue,

    // Cache operations
    getCache,
    setCache,
    deleteCache,
    clearCache,

    // High-level helpers
    queueMarkAttendance,
    queueCancelClass,
  }
}
