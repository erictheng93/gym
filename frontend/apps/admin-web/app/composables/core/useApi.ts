/**
 * API 請求增強 Composable
 * 提供請求去重、重試、緩存等功能
 */

import { useErrorHandler, type AppError } from './useErrorHandler'

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

  return {
    request,
    batchRequest,
    createDebouncedRequest,
    clearCache,
    cancelPending
  }
}

// 導出工具函數供測試使用
export { generateRequestKey, delay }
