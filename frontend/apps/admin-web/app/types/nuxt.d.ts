/**
 * Nuxt type augmentation for custom layouts and page meta
 */

// Extend Nuxt's PageMeta to include custom layouts
declare module 'nuxt/schema' {
  interface PageMeta {
    layout?: 'default' | 'admin' | false
  }
}

declare module '#app' {
  interface PageMeta {
    layout?: 'default' | 'admin' | false
  }
}

export {}
