/**
 * Shared offline sync core factory
 * Provides IndexedDB caching and request queuing with fresh auth tokens and parallel sync
 */
import type { QueuedRequest, CacheEntry, SyncResult, OfflineSyncConfig } from '../types/offline-sync'

const DB_VERSION = 1
const STORES = {
  cache: 'cache',
  queue: 'pending_requests',
} as const

// Per-dbName scoping for module-level state
const dbInstances = new Map<string, IDBDatabase>()
const listenersInitializedSet = new Set<string>()

const initDB = (dbName: string): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const existing = dbInstances.get(dbName)
    if (existing) {
      resolve(existing)
      return
    }

    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'))
      return
    }

    const request = indexedDB.open(dbName, DB_VERSION)

    request.onerror = () => reject(request.error)

    request.onsuccess = () => {
      const db = request.result
      db.onclose = () => { dbInstances.delete(dbName) }
      dbInstances.set(dbName, db)
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains(STORES.cache)) {
        db.createObjectStore(STORES.cache, { keyPath: 'key' })
      }

      if (!db.objectStoreNames.contains(STORES.queue)) {
        const queueStore = db.createObjectStore(STORES.queue, { keyPath: 'id' })
        queueStore.createIndex('timestamp', 'timestamp', { unique: false })
        queueStore.createIndex('type', 'type', { unique: false })
      }
    }
  })
}

const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Factory that creates an offline sync composable scoped to a specific app/db
 */
export const createOfflineSync = (config: OfflineSyncConfig) => {
  const { dbName, stateKeyPrefix, getAuthHeaders, concurrency = 3 } = config

  return () => {
    const isOnline = useState<boolean>(`${stateKeyPrefix}online`, () =>
      typeof navigator !== 'undefined' ? navigator.onLine : true
    )
    const pendingCount = useState<number>(`${stateKeyPrefix}pending_count`, () => 0)
    const isSyncing = useState<boolean>(`${stateKeyPrefix}syncing`, () => false)
    const lastSyncAt = useState<number | null>(`${stateKeyPrefix}last`, () => null)

    // ---- Listeners ----

    const setupListeners = () => {
      if (typeof window === 'undefined' || listenersInitializedSet.has(dbName)) return
      listenersInitializedSet.add(dbName)

      const updateOnlineStatus = () => {
        isOnline.value = navigator.onLine
      }

      window.addEventListener('online', () => {
        updateOnlineStatus()
        syncPendingRequests().catch(() => {})
      })
      window.addEventListener('offline', updateOnlineStatus)

      updateOnlineStatus()
      loadPendingCount()
    }

    const loadPendingCount = async () => {
      try {
        const db = await initDB(dbName)
        const tx = db.transaction(STORES.queue, 'readonly')
        const store = tx.objectStore(STORES.queue)
        const countRequest = store.count()

        countRequest.onsuccess = () => {
          pendingCount.value = countRequest.result
        }
      } catch {
        // IndexedDB not available
      }
    }

    // ---- Queue Operations ----

    const queueRequest = async (
      request: Omit<QueuedRequest, 'id' | 'timestamp' | 'retryCount'>
    ): Promise<string> => {
      const db = await initDB(dbName)
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

    const removeFromQueue = async (id: string): Promise<void> => {
      const db = await initDB(dbName)
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

    const getPendingRequests = async (): Promise<QueuedRequest[]> => {
      const db = await initDB(dbName)
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.queue, 'readonly')
        const store = tx.objectStore(STORES.queue)
        const index = store.index('timestamp')
        const request = index.getAll()

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    }

    const clearQueue = async (): Promise<void> => {
      try {
        const db = await initDB(dbName)
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

    // ---- Sync ----

    const executeRequest = async (request: QueuedRequest): Promise<boolean> => {
      try {
        // Get fresh auth headers at sync time (fixes stale token issue)
        const freshHeaders = getAuthHeaders()
        await $fetch(request.url, {
          method: request.method,
          headers: { ...request.headers, ...freshHeaders },
          body: request.body as Record<string, unknown> | undefined,
        })
        return true
      } catch {
        return false
      }
    }

    const updateRetryCount = async (request: QueuedRequest): Promise<void> => {
      const db = await initDB(dbName)
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.queue, 'readwrite')
        const store = tx.objectStore(STORES.queue)
        const updatedRequest = { ...request, retryCount: request.retryCount + 1 }
        const putRequest = store.put(updatedRequest)

        putRequest.onsuccess = () => resolve()
        putRequest.onerror = () => reject(putRequest.error)
      })
    }

    const syncPendingRequests = async (): Promise<SyncResult> => {
      if (!isOnline.value || isSyncing.value) {
        return { success: false, synced: 0, failed: 0, errors: [] }
      }

      isSyncing.value = true
      const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] }

      try {
        const pending = await getPendingRequests()

        // Separate expired requests from actionable ones
        const actionable: QueuedRequest[] = []
        for (const request of pending) {
          if (request.retryCount >= request.maxRetries) {
            await removeFromQueue(request.id)
            result.failed++
            result.errors.push({ id: request.id, error: '已達最大重試次數' })
          } else {
            actionable.push(request)
          }
        }

        // Process in parallel chunks (Phase 4)
        const processRequest = async (request: QueuedRequest) => {
          const success = await executeRequest(request)
          if (success) {
            await removeFromQueue(request.id)
            return { success: true, id: request.id }
          } else {
            await updateRetryCount(request)
            return { success: false, id: request.id }
          }
        }

        for (let i = 0; i < actionable.length; i += concurrency) {
          const chunk = actionable.slice(i, i + concurrency)
          const results = await Promise.allSettled(chunk.map(processRequest))

          for (const settledResult of results) {
            if (settledResult.status === 'fulfilled') {
              if (settledResult.value.success) {
                result.synced++
              } else {
                result.failed++
                result.errors.push({
                  id: settledResult.value.id,
                  error: '同步失敗，將稍後重試',
                })
              }
            } else {
              result.failed++
              result.errors.push({
                id: 'unknown',
                error: '同步過程發生錯誤',
              })
            }
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

    // ---- Cache Operations ----

    const getCache = async <T>(key: string): Promise<T | null> => {
      try {
        const db = await initDB(dbName)
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

            if (entry.expiresAt < Date.now()) {
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

    const setCache = async <T>(
      key: string,
      data: T,
      ttlMs: number = 5 * 60 * 1000
    ): Promise<void> => {
      try {
        const db = await initDB(dbName)
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

    const deleteCache = async (key: string): Promise<void> => {
      try {
        const db = await initDB(dbName)
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

    const clearCache = async (): Promise<void> => {
      try {
        const db = await initDB(dbName)
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

    // ---- Computed ----

    const hasPendingRequests = computed(() => pendingCount.value > 0)

    const syncStatusLabel = computed(() => {
      if (isSyncing.value) return '同步中...'
      if (!isOnline.value) return '離線模式'
      if (hasPendingRequests.value) return `${pendingCount.value} 項待同步`
      return '已同步'
    })

    return {
      isOnline,
      isSyncing,
      pendingCount,
      lastSyncAt,
      hasPendingRequests,
      syncStatusLabel,
      setupListeners,
      queueRequest,
      removeFromQueue,
      getPendingRequests,
      syncPendingRequests,
      clearQueue,
      getCache,
      setCache,
      deleteCache,
      clearCache,
    }
  }
}
