/// <reference types="vite/client" />

// Extend ImportMeta for Vite/Nuxt environment
interface ImportMeta {
  readonly dev: boolean
  readonly env: Record<string, string>
}
