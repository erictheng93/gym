import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.nuxt/**',
      '**/cypress/**',
      '**/e2e/**',
      '**/.{idea,git,cache,output,temp}/**',
      // Exclude Playwright tests (root-level .spec.ts files)
      'test-*.spec.ts',
      'playwright*.spec.ts'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/**',
        '**/.nuxt/**',
      ]
    }
  },
  resolve: {
    alias: {
      // Test setup alias
      '@test/setup': resolve(__dirname, 'vitest.setup.ts'),
      // App-specific aliases for monorepo
      '~/constants': resolve(__dirname, 'apps/admin-web/app/constants'),
      '~/composables': resolve(__dirname, 'apps/admin-web/app/composables'),
      '~/utils': resolve(__dirname, 'apps/admin-web/app/utils'),
      '~/types': resolve(__dirname, 'apps/admin-web/app/types'),
      '~': resolve(__dirname, 'apps/admin-web/app'),
      '@': resolve(__dirname, 'apps/admin-web/app'),
      '@shared': resolve(__dirname, 'packages/shared'),
      '@ui': resolve(__dirname, 'packages/ui'),
      // Package aliases for monorepo
      '@gym-nexus/ui/composables': resolve(__dirname, 'packages/ui/composables'),
      '@gym-nexus/ui/components': resolve(__dirname, 'packages/ui/components'),
      '@gym-nexus/ui': resolve(__dirname, 'packages/ui'),
    }
  }
})
