/**
 * Debounce utility functions for performance optimization
 */

/**
 * Creates a debounced version of a function
 * @param fn The function to debounce
 * @param delay The delay in milliseconds
 * @returns The debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return function (...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      fn(...args)
      timeoutId = null
    }, delay)
  }
}

/**
 * Creates a throttled version of a function
 * @param fn The function to throttle
 * @param limit The minimum time between calls in milliseconds
 * @returns The throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastCall = 0

  return function (...args: Parameters<T>) {
    const now = Date.now()
    if (now - lastCall >= limit) {
      lastCall = now
      fn(...args)
    }
  }
}

/**
 * Request deduplication - prevents duplicate concurrent requests
 */
const pendingRequests = new Map<string, Promise<any>>()

export async function deduplicateRequest<T>(
  key: string,
  requestFn: () => Promise<T>
): Promise<T> {
  // If there's already a pending request with this key, return it
  const pending = pendingRequests.get(key)
  if (pending) {
    return pending as Promise<T>
  }

  // Create new request
  const request = requestFn().finally(() => {
    // Clean up after request completes
    pendingRequests.delete(key)
  })

  pendingRequests.set(key, request)
  return request
}

/**
 * Create a memoized async function with TTL cache
 */
export function memoizeAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: {
    ttl?: number // Time to live in milliseconds
    keyGenerator?: (...args: Parameters<T>) => string
  } = {}
): T {
  const { ttl = 60000, keyGenerator = (...args) => JSON.stringify(args) } = options
  const cache = new Map<string, { value: any; timestamp: number }>()

  return (async (...args: Parameters<T>) => {
    const key = keyGenerator(...args)
    const cached = cache.get(key)

    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.value
    }

    const result = await fn(...args)
    cache.set(key, { value: result, timestamp: Date.now() })
    return result
  }) as T
}
