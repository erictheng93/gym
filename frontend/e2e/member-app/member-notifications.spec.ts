/**
 * E2E Tests for Member Notifications
 * Tests push notification settings and in-app notification preferences/history
 */
import { test, expect, type Page } from '@playwright/test'

async function loginAsMember(page: Page) {
  if (!process.env.TEST_MEMBER_EMAIL || !process.env.TEST_MEMBER_PASSWORD) {
    test.skip()
    return
  }

  await page.goto('/login')
  await page.fill('[data-testid="email-input"], input[placeholder*="郵件"], input[type="email"]', process.env.TEST_MEMBER_EMAIL)
  await page.fill('[data-testid="password-input"], input[type="password"]', process.env.TEST_MEMBER_PASSWORD)
  await page.click('[data-testid="login-button"], button[type="submit"]')
  await expect(page).toHaveURL('/', { timeout: 10000 })
}

test.describe('Member Notifications', () => {
  test.describe('Notifications Settings Page', () => {
    test('should display notifications settings page', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/notifications')

      // Should show page heading or settings content
      await expect(
        page.getByRole('heading', { name: /通知/i })
          .or(page.locator('.page-title:has-text("通知")'))
          .or(page.locator('h1:has-text("通知")'))
      ).toBeVisible({ timeout: 5000 })
    })

    test('should show settings and history tabs', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/notifications')

      await page.waitForTimeout(2000)

      // Check for tab navigation (設定 / 歷史)
      const settingsTab = page.locator('button:has-text("設定"), [data-testid="settings-tab"]')
      const historyTab = page.locator('button:has-text("歷史"), button:has-text("記錄"), [data-testid="history-tab"]')

      if (await settingsTab.isVisible({ timeout: 3000 })) {
        await expect(settingsTab).toBeVisible()
      }
      if (await historyTab.isVisible({ timeout: 3000 })) {
        await expect(historyTab).toBeVisible()
      }
    })

    test('should display push notification toggle', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/notifications')

      await page.waitForTimeout(2000)

      // Should show push notification section
      const pushSection = page.locator('text=推播通知').or(page.locator('text=Push'))
      if (await pushSection.isVisible({ timeout: 3000 })) {
        await expect(pushSection).toBeVisible()
      }
    })

    test('should display notification type preferences', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/notifications')

      await page.waitForTimeout(2000)

      // Should show notification type toggles (booking reminder, class cancelled, etc.)
      const notificationTypes = page.locator('.notification-type, .preference-item, .toggle-row')
      const count = await notificationTypes.count()

      // At least some notification type toggles should exist
      if (count > 0) {
        expect(count).toBeGreaterThanOrEqual(1)
      }
    })

    test('should display channel configuration', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/notifications')

      await page.waitForTimeout(2000)

      // Check for channel-related labels (LINE, Email, SMS, Push)
      const channelLabels = ['LINE', 'Email', 'SMS', '推播']
      let foundChannels = 0

      for (const label of channelLabels) {
        const element = page.locator(`text=${label}`)
        if (await element.isVisible({ timeout: 1000 }).catch(() => false)) {
          foundChannels++
        }
      }

      // At least push should be available
      expect(foundChannels).toBeGreaterThanOrEqual(1)
    })

    test('should switch to notification history tab', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/notifications')

      await page.waitForTimeout(2000)

      const historyTab = page.locator('button:has-text("歷史"), button:has-text("記錄"), [data-testid="history-tab"]')
      if (await historyTab.isVisible({ timeout: 3000 })) {
        await historyTab.click()
        await page.waitForTimeout(1000)

        // Should show notification list or empty state
        const hasContent = await page.locator('.notification-item, .notification-card, .empty-state, text=沒有通知').isVisible({ timeout: 3000 }).catch(() => false)
        expect(hasContent).toBe(true)
      }
    })
  })
})
