/**
 * Shared offline sync core factory
 * Provides IndexedDB caching and request queuing with fresh auth tokens and strict FIFO sync
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
const activeSyncPromises = new Map<string, Promise<SyncResult>>()
// Strictly increasing queue timestamps per dbName, so FIFO order survives same-millisecond enqueues
const lastTimestamps = new Map<string, number>()

const nextTimestamp = (dbName: string): number => {
  const ts = Math.max(Date.now(), (lastTimestamps.get(dbName) ?? 0) + 1)
  lastTimestamps.set(dbName, ts)
  return ts
}

const getPath = (url: string): string => {
  try {
    return new URL(url, 'http://local').pathname
  } catch {
    return url.split('?')[0] ?? url
  }
}

const getErrorStatus = (error: unknown): number | undefined => {
  const e = error as { statusCode?: number; status?: number; response?: { status?: number } } | null
  return e?.statusCode ?? e?.status ?? e?.response?.status
}

// Network failures (no status), timeouts, rate limits and 5xx are transient; other 4xx are not
const isRetryableError = (error: unknown): boolean => {
  const status = getErrorStatus(error)
  return status === undefined || status === 408 || status === 429 || status >= 500
}

// Returns a copy with tempId replaced by serverId in url/body, or null if not referenced
const replaceTempId = (
  request: QueuedRequest,
  tempId: string,
  serverId: string
): QueuedRequest | null => {
  const bodyJson = request.body === undefined ? undefined : JSON.stringify(request.body)
  if (!request.url.includes(tempId) && !bodyJson?.includes(tempId)) return null
  return {
    ...request,
    url: request.url.split(tempId).join(serverId),
    body: bodyJson === undefined ? undefined : JSON.parse(bodyJson.split(tempId).join(serverId)),
  }
}

const extractServerId = (response: unknown): string | undefined => {
  const data = (response as { data?: { id?: unknown } } | null)?.data
  const id = data?.id
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined
}

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
  const { dbName, stateKeyPrefix, getAuthHeaders } = config

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
      pruneExpiredCache().catch(() => {})
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
        timestamp: nextTimestamp(dbName),
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

    const executeRequest = async (
      request: QueuedRequest
    ): Promise<{ ok: true; data: unknown } | { ok: false; retryable: boolean }> => {
      try {
        // Get fresh auth headers at sync time (fixes stale token issue)
        const freshHeaders = getAuthHeaders()
        const data = await $fetch(request.url, {
          method: request.method,
          headers: freshHeaders,
          body: request.body as Record<string, unknown> | undefined,
        })
        return { ok: true, data }
      } catch (error) {
        return { ok: false, retryable: isRetryableError(error) }
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

    // Remove a synced request and persist its dependents (temp id -> server id) in one
    // transaction, so a crash can neither re-send the create nor strand a temp id.
    const commitSynced = async (id: string, dependents: QueuedRequest[]): Promise<void> => {
      const db = await initDB(dbName)
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.queue, 'readwrite')
        const store = tx.objectStore(STORES.queue)
        store.delete(id)
        for (const dependent of dependents) store.put(dependent)
        tx.oncomplete = () => {
          pendingCount.value = Math.max(0, pendingCount.value - 1)
          resolve()
        }
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    }

    const syncPendingRequests = async (): Promise<SyncResult> => {
      if (!isOnline.value) {
        return { success: false, synced: 0, failed: 0, errors: [] }
      }

      // Deduplicate concurrent sync calls via a Promise-based lock
      const existing = activeSyncPromises.get(dbName)
      if (existing) return existing

      const doSync = async (): Promise<SyncResult> => {
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

          // Strict FIFO: one request at a time, oldest first, so dependent mutations
          // (create -> update -> delete of the same entity) never race.
          actionable.sort((x, y) => x.timestamp - y.timestamp)

          const blockedPaths = new Set<string>() // paths with a retryable failure this run
          const blockedTempIds = new Set<string>() // queue ids of failed creates

          for (const [index, request] of actionable.entries()) {
            const path = getPath(request.url)
            const isBlocked = blockedPaths.has(path)
              || [...blockedTempIds].some(id => request.url.includes(id))

            // A transient failure earlier in this run: hold back later mutations on the
            // same resource (left untouched in the queue, retried on the next sync)
            if (isBlocked) {
              blockedPaths.add(path)
              result.failed++
              result.errors.push({ id: request.id, error: '前置請求失敗，已暫緩同步' })
              continue
            }

            try {
              const outcome = await executeRequest(request)
              if (outcome.ok) {
                // Later requests may reference this request's queue id as an offline temp id
                const serverId = extractServerId(outcome.data)
                const dependents: QueuedRequest[] = []
                if (serverId) {
                  for (const later of actionable.slice(index + 1)) {
                    const rewritten = replaceTempId(later, request.id, serverId)
                    if (rewritten) {
                      Object.assign(later, rewritten)
                      dependents.push(later)
                    }
                  }
                }
                await commitSynced(request.id, dependents)
                result.synced++
              } else {
                await updateRetryCount(request)
                if (outcome.retryable) {
                  blockedPaths.add(path)
                  blockedTempIds.add(request.id)
                }
                result.failed++
                result.errors.push({ id: request.id, error: '同步失敗，將稍後重試' })
              }
            } catch {
              result.failed++
              result.errors.push({ id: request.id, error: '同步過程發生錯誤' })
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
          activeSyncPromises.delete(dbName)
        }

        return result
      }

      const promise = doSync()
      activeSyncPromises.set(dbName, promise)
      return promise
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

    /**
     * Delete every expired entry. getCache only removes an expired entry when
     * that exact key is read again, and keys embed query options (date ranges,
     * filters), so without this sweep the store only ever grows.
     * Resolves with the number deleted once the transaction has committed.
     */
    const pruneExpiredCache = async (): Promise<number> => {
      try {
        const db = await initDB(dbName)
        const now = Date.now()
        return await new Promise((resolve) => {
          const tx = db.transaction(STORES.cache, 'readwrite')
          let pruned = 0
          // ponytail: full cursor scan; add an expiresAt index if the cache grows past a few thousand entries
          const request = tx.objectStore(STORES.cache).openCursor()
          request.onsuccess = () => {
            const cursor = request.result
            if (!cursor) return
            if ((cursor.value as CacheEntry<unknown>).expiresAt < now) {
              cursor.delete()
              pruned++
            }
            cursor.continue()
          }
          tx.oncomplete = () => resolve(pruned)
          tx.onerror = () => resolve(0)
          tx.onabort = () => resolve(0)
        })
      } catch {
        return 0
      }
    }

    /**
     * Call before the session is dropped. Queued requests pick up auth headers
     * at sync time, so anything left behind would replay under the NEXT
     * account on this device; the cache would show it this user's data.
     * Flush what the current token can still send, then wipe both stores.
     */
    const resetForLogout = async (): Promise<void> => {
      if (isOnline.value && pendingCount.value > 0) {
        // ponytail: 5s cap so a hung request cannot block logout; unsent items are dropped
        await Promise.race([
          syncPendingRequests().catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ])
      }
      await Promise.all([clearCache(), clearQueue()])
    }

    /** Text for the logout confirmation when unsent items would be lost; null when nothing is pending. */
    const pendingLogoutWarning = (): string | null => {
      const n = pendingCount.value
      if (n <= 0) return null
      return isOnline.value
        ? `還有 ${n} 筆資料尚未上傳。登出時會先嘗試上傳，若上傳失敗，這些資料將被刪除且無法復原。確定要登出嗎？`
        : `目前沒有網路，還有 ${n} 筆資料尚未上傳。登出後這些資料將被刪除且無法復原。確定要登出嗎？`
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
      pruneExpiredCache,
      resetForLogout,
      pendingLogoutWarning,
    }
  }
}
