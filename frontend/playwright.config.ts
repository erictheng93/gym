import { defineConfig, devices } from '@playwright/test'
import { TestEnv } from './e2e/config/test-env'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!TestEnv.isCI,
  retries: TestEnv.isCI ? TestEnv.retries : 0,
  workers: TestEnv.isCI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: TestEnv.baseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: TestEnv.timeouts.default,
    navigationTimeout: TestEnv.timeouts.navigation,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'bun run dev',
    url: TestEnv.baseUrl,
    reuseExistingServer: !TestEnv.isCI,
    timeout: 120000,
  },
})
