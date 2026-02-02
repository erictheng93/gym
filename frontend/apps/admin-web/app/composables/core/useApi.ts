/**
 * API 請求增強 Composable
 * 提供請求去重、重試、緩存等功能
 */

import { useErrorHandler, type AppError } from './useErrorHandler'

// ============================================
// Cache Key Constants
// ============================================
/**
 * 預定義的緩存鍵前綴
 * 用於 clearCache 和 invalidateCache
 */
export const CACHE_KEYS = {
  MEMBERS: 'members',
  CONTRACTS: 'contracts',
  PAYMENTS: 'payments',
  BRANCHES: 'branches',
  PLANS: 'plans',
  EMPLOYEES: 'employees',
  JOB_TITLES: 'job_titles',
  CLASSES: 'classes',
  CLASS_CATEGORIES: 'class_categories',
  CLASS_SESSIONS: 'class_sessions',
  CLASS_BOOKINGS: 'class_bookings',
  ATTENDANCE: 'attendance',
  LEAVE_REQUESTS: 'leave_requests',
  REPORTS: 'reports',
} as const

export type CacheKeyType = typeof CACHE_KEYS[keyof typeof CACHE_KEYS]

// 請求配置選項
export interface ApiRequestOptions {
  /** 請求上下文，用於錯誤處理和日誌 */
  context?: string
  /** 重試次數（預設 0，不重試） */
  retries?: number
  /** 重試延遲時間（毫秒） */
  retryDelay?: number
  /** 是否啟用請求去重（預設 true） */
  dedupe?: boolean
  /** 去重超時時間（毫秒，預設 2000） */
  dedupeTimeout?: number
  /** 緩存時間（毫秒，0 表示不緩存） */
  cacheTTL?: number
  /** 緩存鍵（若不提供則自動生成） */
  cacheKey?: string
  /** 是否顯示錯誤通知（預設 true） */
  showErrorToast?: boolean
  /** 自定義錯誤訊息 */
  errorMessage?: string
}

// API 響應結果
export interface ApiResult<T> {
  data: T | null
  error: AppError | null
  fromCache: boolean
}

// 進行中的請求追蹤
const pendingRequests = new Map<string, Promise<unknown>>()

// 緩存存儲
interface CacheEntry<T> {
  data: T
  expiry: number
}
const cache = new Map<string, CacheEntry<unknown>>()

/**
 * 生成請求的唯一標識
 */
function generateRequestKey(fn: Function, args?: unknown[]): string {
  const fnString = fn.toString().slice(0, 100)
  const argsString = args ? JSON.stringify(args) : ''
  return `${fnString}:${argsString}`
}

/**
 * 延遲函數
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 清除過期緩存
 */
function cleanExpiredCache(): void {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (entry.expiry < now) {
      cache.delete(key)
    }
  }
}

/**
 * API 請求增強 Composable
 */
export function useApi() {
  const { handleError, parseError } = useErrorHandler()

  /**
   * 執行 API 請求，包含增強功能
   * @param fn - 要執行的異步函數
   * @param options - 請求配置選項
   */
  const request = async <T>(
    fn: () => Promise<T>,
    options?: ApiRequestOptions
  ): Promise<ApiResult<T>> => {
    const {
      context = 'API Request',
      retries = 0,
      retryDelay = 1000,
      dedupe = true,
      dedupeTimeout = 2000,
      cacheTTL = 0,
      cacheKey,
      showErrorToast = true,
      errorMessage
    } = options || {}

    const requestKey = cacheKey || generateRequestKey(fn)

    // 檢查緩存
    if (cacheTTL > 0) {
      cleanExpiredCache()
      const cached = cache.get(requestKey)
      if (cached && cached.expiry > Date.now()) {
        return { data: cached.data as T, error: null, fromCache: true }
      }
    }

    // 請求去重 - 如果相同請求正在進行中，等待並返回結果
    if (dedupe && pendingRequests.has(requestKey)) {
      try {
        const result = await pendingRequests.get(requestKey) as T
        return { data: result, error: null, fromCache: false }
      } catch (error) {
        const appError = handleError(error, { context, showToast: showErrorToast, customMessage: errorMessage })
        return { data: null, error: appError, fromCache: false }
      }
    }

    // 執行請求（帶重試）
    const executeWithRetry = async (attemptNumber: number): Promise<T> => {
      try {
        const result = await fn()

        // 成功後緩存結果
        if (cacheTTL > 0) {
          cache.set(requestKey, {
            data: result,
            expiry: Date.now() + cacheTTL
          })
        }

        return result
      } catch (error) {
        const appError = parseError(error, context)

        // 只有可重試的錯誤（網路錯誤）才進行重試
        if (appError.retryable && attemptNumber < retries) {
          if (import.meta.dev) {
            console.log(`[useApi] Retry ${attemptNumber + 1}/${retries} for: ${context}`)
          }
          await delay(retryDelay * (attemptNumber + 1)) // 指數退避
          return executeWithRetry(attemptNumber + 1)
        }

        throw error
      }
    }

    // 創建請求 Promise
    const requestPromise = executeWithRetry(0)

    // 註冊進行中的請求
    if (dedupe) {
      pendingRequests.set(requestKey, requestPromise)

      // 設定超時清理
      setTimeout(() => {
        pendingRequests.delete(requestKey)
      }, dedupeTimeout)
    }

    try {
      const data = await requestPromise
      return { data, error: null, fromCache: false }
    } catch (error) {
      const appError = handleError(error, { context, showToast: showErrorToast, customMessage: errorMessage })
      return { data: null, error: appError, fromCache: false }
    } finally {
      pendingRequests.delete(requestKey)
    }
  }

  /**
   * 批量執行請求
   * @param requests - 請求配置陣列
   */
  const batchRequest = async <T extends readonly unknown[]>(
    requests: { [K in keyof T]: () => Promise<T[K]> },
    options?: Omit<ApiRequestOptions, 'cacheKey'>
  ): Promise<{ results: { [K in keyof T]: ApiResult<T[K]> } }> => {
    const results = await Promise.all(
      requests.map((fn, index) =>
        request(fn, { ...options, context: `${options?.context || 'Batch'}[${index}]` })
      )
    )
    return { results: results as { [K in keyof T]: ApiResult<T[K]> } }
  }

  /**
   * 防抖請求 - 用於搜尋等頻繁觸發的場景
   * @param fn - 要執行的異步函數
   * @param wait - 防抖時間（毫秒）
   */
  const createDebouncedRequest = <T, Args extends unknown[]>(
    fn: (...args: Args) => Promise<T>,
    wait: number = 300
  ) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let pendingResolve: ((result: ApiResult<T>) => void) | null = null

    return (...args: Args): Promise<ApiResult<T>> => {
      return new Promise((resolve) => {
        // 清除之前的計時器
        if (timeoutId) {
          clearTimeout(timeoutId)
        }

        // 保存 resolve 函數
        pendingResolve = resolve

        // 設置新的計時器
        timeoutId = setTimeout(async () => {
          const result = await request(() => fn(...args), {
            dedupe: false // 防抖請求不需要額外的去重
          })
          if (pendingResolve === resolve) {
            resolve(result)
          }
        }, wait)
      })
    }
  }

  /**
   * 清除指定鍵的緩存
   * @param key - 緩存鍵（可使用通配符 *）
   */
  const clearCache = (key?: string): void => {
    if (!key) {
      cache.clear()
      return
    }

    if (key.includes('*')) {
      const pattern = new RegExp('^' + key.replace(/\*/g, '.*') + '$')
      for (const cacheKey of cache.keys()) {
        if (pattern.test(cacheKey)) {
          cache.delete(cacheKey)
        }
      }
    } else {
      cache.delete(key)
    }
  }

  /**
   * 取消進行中的請求（通過清除 pending 狀態）
   * @param key - 請求鍵
   */
  const cancelPending = (key?: string): void => {
    if (!key) {
      pendingRequests.clear()
      return
    }
    pendingRequests.delete(key)
  }

  /**
   * 失效多個緩存鍵
   * @param keys - 緩存鍵陣列（支援 CACHE_KEYS 常量）
   *
   * @example
   * // 失效會員相關緩存
   * invalidateCache([CACHE_KEYS.MEMBERS])
   *
   * // 失效多個相關緩存
   * invalidateCache([CACHE_KEYS.CONTRACTS, CACHE_KEYS.PAYMENTS])
   */
  const invalidateCache = (keys: (CacheKeyType | string)[]): void => {
    for (const key of keys) {
      // 使用通配符模式清除所有相關緩存
      clearCache(`${key}*`)
    }
  }

  /**
   * 執行變更操作（create/update/delete）並自動失效相關緩存
   * @param fn - 要執行的異步函數
   * @param invalidateKeys - 成功後要失效的緩存鍵
   * @param options - 請求配置選項
   *
   * @example
   * // 創建會員並失效會員列表緩存
   * const result = await mutate(
   *   () => fetch(`${apiBaseUrl}/api/members`, { method: 'POST', body: JSON.stringify(data) }),
   *   [CACHE_KEYS.MEMBERS],
   *   { context: 'createMember' }
   * )
   */
  const mutate = async <T>(
    fn: () => Promise<T>,
    invalidateKeys: (CacheKeyType | string)[],
    options?: ApiRequestOptions
  ): Promise<ApiResult<T>> => {
    const result = await request(fn, {
      ...options,
      dedupe: false, // 變更操作不應去重
      cacheTTL: 0    // 變更操作不應緩存
    })

    // 成功後失效相關緩存
    if (result.data !== null) {
      invalidateCache(invalidateKeys)
    }

    return result
  }

  return {
    request,
    batchRequest,
    createDebouncedRequest,
    clearCache,
    cancelPending,
    invalidateCache,
    mutate
  }
}

// 導出工具函數供測試使用
export { generateRequestKey, delay }
