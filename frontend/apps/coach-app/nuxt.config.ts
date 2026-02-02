// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Extend from UI package layer (統一架構)
  extends: ['../../packages/ui'],

  modules: ['@vite-pwa/nuxt'],

  // Vite aliases for proper path resolution
  alias: {
    '@shared': resolve(__dirname, '../../packages/shared'),
    '@ui': resolve(__dirname, '../../packages/ui')
  },

  // Auto-import utilities from shared package
  imports: {
    imports: [
      { from: '@shared/utils/formatters', name: 'formatDate' },
      { from: '@shared/utils/formatters', name: 'formatCurrency' },
      { from: '@shared/utils/formatters', name: 'formatNumber' },
      { from: '@shared/utils/formatters', name: 'formatPhone' },
      { from: '@shared/utils/formatters', name: 'formatRelativeTime' },
      { from: '@shared/utils/status-badges', name: 'getMemberStatusBadge' },
      { from: '@shared/utils/status-badges', name: 'getContractStatusBadge' },
      { from: '@shared/utils/status-badges', name: 'getPaymentStatusBadge' },
      { from: '@shared/utils/status-badges', name: 'getStatusBadge' }
    ]
  },

  devServer: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 3003
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8056',
      // Sentry error monitoring
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN || '',
      sentryDebug: process.env.NUXT_PUBLIC_SENTRY_DEBUG === 'true',
      environment: process.env.NODE_ENV || 'development',
      appVersion: process.env.APP_VERSION || '1.0.0',
    }
  },

  app: {
    head: {
      title: 'Gym Nexus 教練',
      htmlAttrs: {
        lang: 'zh-TW'
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' },
        { name: 'description', content: 'Gym Nexus 教練 App - 學員管理、課程排程、教案系統' },
        { name: 'format-detection', content: 'telephone=no' },
        // PWA Meta Tags
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'GymNexus Coach' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'msapplication-TileColor', content: '#3b82f6' },
        { name: 'msapplication-tap-highlight', content: 'no' },
        // Theme Color (blue for coach app)
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#ffffff' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#1e3a5f' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' }
      ]
    },
    pageTransition: { name: 'page', mode: 'out-in' }
  },

  // PWA 配置
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Gym Nexus 教練',
      short_name: 'GymNexus Coach',
      description: '健身房教練端：學員管理、課程排程、教案系統',
      lang: 'zh-TW',
      theme_color: '#3b82f6',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      scope: '/',
      icons: [
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/icons/maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      runtimeCaching: [
        {
          // API 請求 - Network First
          urlPattern: /^https:\/\/.*\/items\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 60 * 60 * 24
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        },
        {
          // 圖片 - Cache First
          urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'image-cache',
            expiration: {
              maxEntries: 30,
              maxAgeSeconds: 60 * 60 * 24 * 7
            }
          }
        }
      ],
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//]
    },
    client: {
      installPrompt: true,
      periodicSyncForUpdates: 3600
    },
    devOptions: {
      enabled: true,
      type: 'module'
    }
  },

  typescript: {
    strict: true
  },

  // Security headers
  routeRules: {
    '/**': {
      headers: {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob: https:",
          "connect-src 'self' http://localhost:* https://*.sentry.io ws://localhost:* wss://localhost:*",
          "manifest-src 'self'",
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'"
        ].join('; ')
      }
    }
  },

  nitro: {
    routeRules: {
      '/**': {
        headers: {
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: blob: https:",
            "connect-src 'self' http://localhost:* https://*.sentry.io ws://localhost:* wss://localhost:*",
            "manifest-src 'self'",
            "worker-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'"
          ].join('; ')
        }
      }
    }
  }
})
