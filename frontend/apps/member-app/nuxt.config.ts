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
    port: Number(process.env.PORT) || 3002
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      directusUrl: process.env.DIRECTUS_URL || 'http://localhost:8500',
      // Sentry error monitoring
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN || '',
      sentryDebug: process.env.NUXT_PUBLIC_SENTRY_DEBUG === 'true',
      environment: process.env.NODE_ENV || 'development',
      appVersion: process.env.APP_VERSION || '1.0.0',
    }
  },

  app: {
    head: {
      title: 'Gym Nexus 會員',
      htmlAttrs: {
        lang: 'zh-TW'
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' },
        { name: 'description', content: 'Gym Nexus 會員 App - 入場、預約、合約管理' },
        { name: 'format-detection', content: 'telephone=no' },
        // PWA Meta Tags
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Gym Nexus' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'msapplication-TileColor', content: '#10b981' },
        { name: 'msapplication-tap-highlight', content: 'no' },
        // Theme Color
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#ffffff' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#000000' }
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
      name: 'Gym Nexus 會員',
      short_name: 'GymNexus',
      description: '健身房會員入場、預約課程、合約管理',
      lang: 'zh-TW',
      theme_color: '#10b981',
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
      }
    }
  },

  nitro: {
    // Additional security headers for Nitro server
    routeRules: {
      '/**': {
        headers: {
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'X-XSS-Protection': '1; mode=block',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        }
      }
    }
  }
})
