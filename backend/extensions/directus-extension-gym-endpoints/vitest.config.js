/**
 * Vitest Configuration for Backend Extension Tests
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.js', '**/*.test.js'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/**/__tests__/**', 'dist/**'],
    },
    setupFiles: ['./__tests__/setup.js'],
    testTimeout: 10000,
  },
});
