export interface QueuedRequest {
  id: string
  url: string
  method: 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  timestamp: number
  retryCount: number
  maxRetries: number
  type: string
  optimisticId?: string
  description?: string
}

export interface CacheEntry<T = unknown> {
  key: string
  data: T
  timestamp: number
  expiresAt: number
}

export interface SyncResult {
  success: boolean
  synced: number
  failed: number
  errors: Array<{ id: string; error: string }>
}

export interface OfflineSyncConfig {
  dbName: string
  stateKeyPrefix: string
  getAuthHeaders: () => Record<string, string>
  concurrency?: number
}
