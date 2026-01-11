/**
 * Sentry Error Tracking Plugin (Client-only)
 *
 * Initializes Sentry for error tracking and performance monitoring.
 * Only active when NUXT_PUBLIC_SENTRY_DSN is configured.
 */
import * as Sentry from '@sentry/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const router = useRouter()

  // Skip initialization if no DSN is configured
  if (!config.public.sentryDsn) {
    console.log('[Sentry] Skipped - No DSN configured')
    return {
      provide: {
        sentry: null
      }
    }
  }

  // Initialize Sentry
  Sentry.init({
    app: nuxtApp.vueApp,
    dsn: config.public.sentryDsn,
    environment: config.public.sentryEnvironment,

    // Performance monitoring
    tracesSampleRate: config.public.sentryEnvironment === 'production' ? 0.1 : 1.0,

    // Session replay (only in production)
    replaysSessionSampleRate: config.public.sentryEnvironment === 'production' ? 0.1 : 0,
    replaysOnErrorSampleRate: 1.0,

    // Error filtering
    beforeSend(event, hint) {
      const error = hint.originalException

      // Filter out expected authentication errors
      if (error instanceof Error) {
        // Skip auth-related errors that happen during normal checkAuth flow
        if (
          error.message?.includes('INVALID_TOKEN') ||
          error.message?.includes('TOKEN_EXPIRED') ||
          error.message?.includes('INVALID_CREDENTIALS')
        ) {
          return null
        }

        // Skip network errors during auth check (expected when session expired)
        if (error.message?.includes('fetch') && error.message?.includes('401')) {
          return null
        }
      }

      return event
    },

    // Integrations
    integrations: [
      Sentry.browserTracingIntegration({
        router,
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Additional config
    debug: config.public.sentryEnvironment !== 'production',
  })

  console.log(`[Sentry] Initialized (env: ${config.public.sentryEnvironment})`)

  return {
    provide: {
      sentry: Sentry
    }
  }
})
