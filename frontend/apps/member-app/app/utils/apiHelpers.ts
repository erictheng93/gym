/**
 * API Helper Utilities
 * Provides retry logic and error extraction helpers
 */

/**
 * Standard API result type for composable return values
 */
export interface ApiResult<T = void> {
  success: boolean
  message: string
  data?: T
}

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Initial backoff delay in ms (default: 1000) */
  backoffMs?: number
  /** Maximum backoff delay in ms (default: 10000) */
  maxBackoffMs?: number
  /** Whether to retry on specific status codes */
  retryOnStatus?: number[]
  /** Callback fired on each retry attempt */
  onRetry?: (attempt: number, error: unknown) => void
}

/**
 * Extract error message from various error formats
 * Works with $fetch errors, standard errors, and string messages
 *
 * @param error - The error to extract message from
 * @param fallback - Fallback message if extraction fails
 * @returns User-friendly error message
 *
 * @example
 * ```ts
 * try {
 *   await $fetch('/api/data')
 * } catch (error) {
 *   return { success: false, message: extractErrorMessage(error, '操作失敗') }
 * }
 * ```
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback

  // Handle string error
  if (typeof error === 'string') return error

  // Handle Error object
  if (error instanceof Error) {
    return error.message || fallback
  }

  // Handle $fetch error with data property
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>

    // Check data.message (common in API responses)
    if ('data' in err && typeof err.data === 'object' && err.data !== null) {
      const data = err.data as Record<string, unknown>
      if ('message' in data && typeof data.message === 'string') {
        return data.message
      }
    }

    // Check direct message property
    if ('message' in err && typeof err.message === 'string') {
      return err.message
    }

    // Check statusMessage (Nuxt error format)
    if ('statusMessage' in err && typeof err.statusMessage === 'string') {
      return err.statusMessage
    }
  }

  return fallback
}

/**
 * Determines if an error is retryable based on status code
 */
function isRetryableError(error: unknown, retryOnStatus: number[]): boolean {
  if (typeof error !== 'object' || error === null) return true

  const err = error as Record<string, unknown>
  const status = (err.statusCode ?? err.status ?? 0) as number

  // Don't retry client errors (4xx) except for rate limits and specific codes
  if (status >= 400 && status < 500) {
    return retryOnStatus.includes(status)
  }

  // Retry server errors and network errors
  return true
}

/**
 * Execute a function with automatic retry and exponential backoff
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @returns Result of the function
 * @throws Last error after all retries exhausted
 *
 * @example
 * ```ts
 * const data = await withRetry(
 *   () => $fetch('/api/data'),
 *   { maxRetries: 3, backoffMs: 1000 }
 * )
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    backoffMs = 1000,
    maxBackoffMs = 10000,
    retryOnStatus = [408, 429, 502, 503, 504],
    onRetry,
  } = options

  let lastError: unknown

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Check if we should retry
      if (attempt < maxRetries - 1 && isRetryableError(error, retryOnStatus)) {
        // Calculate backoff with jitter
        const delay = Math.min(
          backoffMs * Math.pow(2, attempt) + Math.random() * 100,
          maxBackoffMs
        )

        onRetry?.(attempt + 1, error)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw error
      }
    }
  }

  throw lastError
}

/**
 * Create a debounced version of an async function
 *
 * @param fn - Function to debounce
 * @param delayMs - Delay in milliseconds
 * @returns Debounced function
 */
export function debounceAsync<T extends (...args: Parameters<T>) => Promise<ReturnType<T>>>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let pendingPromise: Promise<ReturnType<T>> | null = null
  let resolveRef: ((value: ReturnType<T>) => void) | null = null
  let rejectRef: ((error: unknown) => void) | null = null

  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    if (!pendingPromise) {
      pendingPromise = new Promise((resolve, reject) => {
        resolveRef = resolve
        rejectRef = reject
      })
    }

    timeoutId = setTimeout(async () => {
      try {
        const result = await fn(...args)
        resolveRef?.(result)
      } catch (error) {
        rejectRef?.(error)
      } finally {
        pendingPromise = null
        resolveRef = null
        rejectRef = null
      }
    }, delayMs)

    return pendingPromise
  }
}

/**
 * Create a throttled version of an async function
 * Only allows one execution per time window
 *
 * @param fn - Function to throttle
 * @param windowMs - Time window in milliseconds
 * @returns Throttled function
 */
export function throttleAsync<T extends (...args: Parameters<T>) => Promise<ReturnType<T>>>(
  fn: T,
  windowMs: number
): (...args: Parameters<T>) => Promise<ReturnType<T> | null> {
  let lastCall = 0
  let pendingPromise: Promise<ReturnType<T>> | null = null

  return async (...args: Parameters<T>): Promise<ReturnType<T> | null> => {
    const now = Date.now()

    if (pendingPromise) {
      return pendingPromise
    }

    if (now - lastCall < windowMs) {
      return null
    }

    lastCall = now
    pendingPromise = fn(...args).finally(() => {
      pendingPromise = null
    })

    return pendingPromise
  }
}

/**
 * Utility to create a delayed promise
 *
 * @param ms - Delay in milliseconds
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
