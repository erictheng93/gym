// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@vite-pwa/nuxt'],

  devServer: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 3001
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      directusUrl: process.env.DIRECTUS_URL || 'http://localhost:8055'
    }
  },

  app: {
    head: {
      title: 'Gym Nexus',
      htmlAttrs: {
        lang: 'zh-TW'
      },
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

  // PWA 配置
  pwa: {
    registerType: 'autoUpdate',
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
      enabled: true,
      type: 'module'
    }
  },

  typescript: {
    strict: true
  }
})
