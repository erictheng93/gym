// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2024-12-01',
  devtools: { enabled: false },

  // Cloudflare Pages deployment
  nitro: {
    preset: 'cloudflare-pages'
  },

  // Extend from UI package layer
  extends: ['../../packages/ui'],

  modules: ['@vite-pwa/nuxt', '@nuxt/eslint'],

  // Vite aliases for proper path resolution
  alias: {
    '@shared': resolve(__dirname, '../../packages/shared'),
    '@ui': resolve(__dirname, '../../packages/ui')
  },

  // Auto-import utilities from shared package using aliases
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
      { from: '@shared/utils/status-badges', name: 'getEmployeeStatusBadge' },
      { from: '@shared/utils/status-badges', name: 'getEmploymentTypeBadge' },
      { from: '@shared/utils/status-badges', name: 'getLeaveStatusBadge' },
      { from: '@shared/utils/status-badges', name: 'getStatusBadge' },
      // Branding composable
      { from: '@shared/composables/useBranding', name: 'useBranding' },
      { from: '@shared/composables/useBranding', name: 'DEFAULT_BRANDING' }
      // Note: Form validation utilities (useFormValidation, required, email, etc.)
      // are auto-imported via the UI layer (extends: ['../../packages/ui'])
    ]
  },

  devServer: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 3001
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      // Backend API URL
      apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8056',
      // API URL with /api prefix for composables (replaces old /gym prefix)
      apiUrl: (process.env.API_BASE_URL || 'http://localhost:8056') + '/api',
      // Sentry error tracking configuration
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN || '',
      sentryEnvironment: process.env.NODE_ENV || 'development',
      // Google OAuth 2.0 configuration
      googleClientId: process.env.NUXT_PUBLIC_GOOGLE_CLIENT_ID || '',
      googleRedirectUri: process.env.NUXT_PUBLIC_GOOGLE_REDIRECT_URI || 'http://localhost:3001/settings/google-integration/callback',
      googleScopes: process.env.NUXT_PUBLIC_GOOGLE_SCOPES || 'https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive.file'
    }
  },

  // Security headers for production
  routeRules: {
    '/**': {
      headers: {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        // CSP - Allow Backend API, Google APIs, Sentry
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com https://*.sentry.io",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com data:",
          "img-src 'self' data: blob: https:",
          "connect-src 'self' http://localhost:* https://*.sentry.io https://accounts.google.com https://www.googleapis.com https://sheets.googleapis.com ws://localhost:* wss://localhost:* http://127.0.0.1:*",
          "frame-src 'self' https://accounts.google.com",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'"
        ].join('; ')
      }
    }
  },


  app: {
    head: {
      title: 'Gym Nexus',
      htmlAttrs: {
        lang: 'zh-TW'
      },
      // Critical inline script to prevent theme flash on hard refresh
      // This runs synchronously before CSS loads to set the correct theme attribute
      script: [
        {
          innerHTML: `(function(){try{var t=localStorage.getItem('gym-nexus-theme')||'dark';var r=t==='system'?(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):t;document.documentElement.setAttribute('data-theme',r);}catch(e){}})()`,
          tagPosition: 'head'
        }
      ],
      // Note: Critical CSS is now injected dynamically via server/plugins/branding.ts
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover' },
        { name: 'description', content: 'Gym Nexus - 智慧健身房管理系統' },
        { name: 'format-detection', content: 'telephone=no' },
        // PWA Meta Tags
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Gym Nexus' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'msapplication-TileColor', content: '#0071e3' },
        { name: 'msapplication-tap-highlight', content: 'no' },
        // Theme Color (支援深色模式)
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#ffffff' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#000000' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon-180x180.png' }
      ]
    },
    pageTransition: { name: 'page', mode: 'out-in' }
  },

  // PWA 配置 - 在开发环境禁用以避免 KV 限制问题
  pwa: {
    registerType: 'autoUpdate',
    disable: process.env.NODE_ENV === 'development', // 开发环境禁用 PWA
    manifest: {
      name: 'Gym Nexus - 智慧健身房管理系統',
      short_name: 'Gym Nexus',
      description: '多據點健身房會員管理、預約課程、電子合約系統',
      lang: 'zh-TW',
      theme_color: '#0071e3',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      scope: '/',
      icons: [
        {
          src: '/icons/icon-72x72.png',
          sizes: '72x72',
          type: 'image/png'
        },
        {
          src: '/icons/icon-96x96.png',
          sizes: '96x96',
          type: 'image/png'
        },
        {
          src: '/icons/icon-128x128.png',
          sizes: '128x128',
          type: 'image/png'
        },
        {
          src: '/icons/icon-144x144.png',
          sizes: '144x144',
          type: 'image/png'
        },
        {
          src: '/icons/icon-152x152.png',
          sizes: '152x152',
          type: 'image/png'
        },
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/icons/icon-384x384.png',
          sizes: '384x384',
          type: 'image/png'
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
      // 預快取靜態資源
      globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
      // 執行時快取策略
      runtimeCaching: [
        {
          // API 請求快取策略 - Network First
          urlPattern: /^https:\/\/.*\/items\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            expiration: {
              maxEntries: 100,
              maxAgeSeconds: 60 * 60 * 24 // 24 小時
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        },
        {
          // 圖片快取策略 - Cache First
          urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'image-cache',
            expiration: {
              maxEntries: 50,
              maxAgeSeconds: 60 * 60 * 24 * 30 // 30 天
            }
          }
        },
        {
          // 字體快取策略
          urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'font-cache',
            expiration: {
              maxEntries: 20,
              maxAgeSeconds: 60 * 60 * 24 * 365 // 1 年
            }
          }
        }
      ],
      // 離線回退
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api\//]
    },
    client: {
      installPrompt: true,
      periodicSyncForUpdates: 3600 // 每小時檢查更新
    },
    devOptions: {
      enabled: false,
      type: 'module'
    }
  },

  typescript: {
    strict: true
  },

  // Ignore test files and test-setup.ts in nuxt build (they're validated by vitest)
  ignore: [
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/test-setup.ts'
  ],

  // Vite configuration to fix Windows path issues with non-ASCII characters
  vite: {
    server: {
      fs: {
        strict: false,
        allow: ['..']
      }
    },
    plugins: [
      {
        name: 'fix-windows-nuxt-paths',
        configureServer(server) {
          // Add middleware to redirect /_nuxt/C:/ to /_nuxt/@fs/C:/
          server.middlewares.use((req, res, next) => {
            if (req.url && req.url.startsWith('/_nuxt/') && /^\/_nuxt\/[A-Za-z](%3A|:)/.test(req.url)) {
              const newUrl = req.url.replace('/_nuxt/', '/_nuxt/@fs/')
              res.writeHead(302, { Location: newUrl })
              res.end()
              return
            }
            next()
          })
        }
      }
    ]
  }
})
