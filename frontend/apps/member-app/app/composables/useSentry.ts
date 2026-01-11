/**
 * useSentry composable
 * Type-safe access to Sentry error tracking functionality
 */

interface SentryUser {
  id?: string
  email?: string
  username?: string
  [key: string]: unknown
}

interface SentryBreadcrumb {
  type?: string
  category?: string
  message?: string
  data?: Record<string, unknown>
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug'
}

interface SentryContext {
  captureException: (error: unknown, context?: Record<string, unknown>) => string
  captureMessage: (message: string, level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug') => string
  setUser: (user: SentryUser | null) => void
  setTag: (key: string, value: string) => void
  setExtra: (key: string, value: unknown) => void
  addBreadcrumb: (breadcrumb: SentryBreadcrumb) => void
}

/**
 * Composable for Sentry error tracking
 *
 * @example
 * ```ts
 * const { captureException, setUser } = useSentry()
 *
 * // Set user context on login
 * setUser({ id: member.id, email: member.email })
 *
 * // Capture manual errors
 * try {
 *   await riskyOperation()
 * } catch (error) {
 *   captureException(error, { context: 'riskyOperation' })
 * }
 * ```
 */
export const useSentry = (): SentryContext => {
  const nuxtApp = useNuxtApp()
  const sentry = nuxtApp.$sentry as SentryContext | undefined

  // Return no-op functions if Sentry is not configured
  if (!sentry) {
    return {
      captureException: () => '',
      captureMessage: () => '',
      setUser: () => {},
      setTag: () => {},
      setExtra: () => {},
      addBreadcrumb: () => {},
    }
  }

  return sentry
}
