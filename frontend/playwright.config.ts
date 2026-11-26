import { defineConfig, devices } from '@playwright/test'
import { TestEnv } from './e2e/config/test-env'

/**
 * One Playwright project per app. Each project has its own baseURL, so specs
 * navigate with relative paths (`page.goto('/login')`).
 *
 * The backend (port 8056) is NOT started here; run it yourself with seeded data
 * (see e2e/README.md). Dev servers for the three apps are started if not running.
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: TestEnv.isCI,
  retries: TestEnv.isCI ? TestEnv.retries : 0,
  workers: TestEnv.isCI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: TestEnv.timeouts.default,
    navigationTimeout: TestEnv.timeouts.navigation,
  },

  projects: [
    {
      name: 'admin-web',
      testIgnore: ['coach-app/**', 'member-app/**'],
      use: { ...devices['Desktop Chrome'], baseURL: TestEnv.urls.admin },
    },
    {
      name: 'member-app',
      testDir: './e2e/member-app',
      use: { ...devices['Desktop Chrome'], baseURL: TestEnv.urls.member },
    },
    {
      name: 'coach-app',
      testDir: './e2e/coach-app',
      use: { ...devices['Desktop Chrome'], baseURL: TestEnv.urls.coach },
    },
  ],

  webServer: [
    { command: 'bun run dev:admin', url: TestEnv.urls.admin, reuseExistingServer: !TestEnv.isCI, timeout: 180000 },
    { command: 'bun run dev:member', url: TestEnv.urls.member, reuseExistingServer: !TestEnv.isCI, timeout: 180000 },
    { command: 'bun run dev:coach', url: TestEnv.urls.coach, reuseExistingServer: !TestEnv.isCI, timeout: 180000 },
  ],
})
