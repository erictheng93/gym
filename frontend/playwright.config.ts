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
const webServers = [
  { app: 'admin-web', command: 'bun run dev:admin', url: TestEnv.urls.admin },
  { app: 'member-app', command: 'bun run dev:member', url: TestEnv.urls.member },
  { app: 'coach-app', command: 'bun run dev:coach', url: TestEnv.urls.coach },
]
const apps = process.env.E2E_APPS?.split(',').map(a => a.trim()) ?? webServers.map(s => s.app)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: TestEnv.isCI,
  retries: TestEnv.isCI ? TestEnv.retries : 0,
  workers: TestEnv.isCI ? 1 : undefined,
  reporter: TestEnv.isCI ? [['list'], ['html', { open: 'never' }]] : 'html',
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

  // E2E_APPS (comma-separated, e.g. "admin-web") limits which dev servers start;
  // CI runs one app per job. Default: all three.
  webServer: webServers
    .filter(s => apps.includes(s.app))
    .map(s => ({ command: s.command, url: s.url, reuseExistingServer: !TestEnv.isCI, timeout: 180000 })),
})
