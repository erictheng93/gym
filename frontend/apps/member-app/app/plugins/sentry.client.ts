/**
 * Sentry Error Monitoring Plugin
 * Client-side only error tracking and performance monitoring
 */
import * as Sentry from '@sentry/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const router = useRouter()

  // Skip if no DSN configured
  if (!config.public.sentryDsn) {
    if (import.meta.dev) {
      // Only warn in development
      console.warn('[Sentry] DSN not configured, error tracking disabled')
    }
    return
  }

  Sentry.init({
    app: nuxtApp.vueApp,
    dsn: config.public.sentryDsn,
    environment: config.public.environment || 'development',
    release: config.public.appVersion || undefined,

    integrations: [
      // Browser tracing for performance monitoring
      Sentry.browserTracingIntegration({
        router,
      }),
      // Session replay for error debugging (production only)
      ...(config.public.environment === 'production'
        ? [
            Sentry.replayIntegration({
              maskAllText: true,
              blockAllMedia: true,
            }),
          ]
        : []),
    ],

    // Performance sampling
    tracesSampleRate: config.public.environment === 'production' ? 0.1 : 1.0,

    // Session replay sampling (production only)
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Filter sensitive data before sending
    beforeSend(event) {
      // Scrub sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['x-member-token']
        delete event.request.headers['authorization']
        delete event.request.headers['cookie']
      }

      // Scrub sensitive data from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
            // Remove sensitive URL parameters
            if (breadcrumb.data?.url) {
              try {
                const url = new URL(breadcrumb.data.url)
                url.searchParams.delete('token')
                url.searchParams.delete('otp')
                breadcrumb.data.url = url.toString()
              } catch {
                // Invalid URL, leave as-is
              }
            }
          }
          return breadcrumb
        })
      }

      return event
    },

    // Ignore common non-actionable errors
    ignoreErrors: [
      // Network errors
      'Failed to fetch',
      'NetworkError',
      'Network request failed',
      // User navigation
      'ResizeObserver loop',
      'Navigation cancelled',
      // Safari-specific
      "Can't find variable: ResizeObserver",
      // Chrome extensions
      /^chrome-extension:\/\//,
      // Firefox extensions
      /^moz-extension:\/\//,
    ],

    // Don't send errors in development unless explicitly enabled
    enabled: config.public.environment === 'production' || !!config.public.sentryDebug,
  })

  // Capture Vue errors
  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    Sentry.captureException(error, {
      extra: {
        componentInfo: info,
        componentName: instance?.$options?.name || 'Unknown',
      },
    })

    // Re-throw in development for better DX
    if (import.meta.dev) {
      throw error
    }
  }

  // Capture unhandled promise rejections
  nuxtApp.hook('vue:error', (error, instance, info) => {
    Sentry.captureException(error, {
      extra: {
        hookInfo: info,
        componentName: instance?.$options?.name || 'Unknown',
      },
    })
  })

  // Provide Sentry instance for manual error capturing
  return {
    provide: {
      sentry: {
        captureException: Sentry.captureException,
        captureMessage: Sentry.captureMessage,
        setUser: Sentry.setUser,
        setTag: Sentry.setTag,
        setExtra: Sentry.setExtra,
        addBreadcrumb: Sentry.addBreadcrumb,
      },
    },
  }
})
