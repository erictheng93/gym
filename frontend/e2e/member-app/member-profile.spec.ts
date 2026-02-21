/**
 * E2E Tests for Member Profile Management
 * Tests profile viewing, editing, and navigation
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

test.describe('Member Profile', () => {
  test.describe('Profile Page', () => {
    test('should display profile page with member info', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile')

      // Should show profile header with name
      await expect(page.locator('.profile-name, h1')).toBeVisible()

      // Should show member code
      await expect(page.locator('.profile-code')).toBeVisible()

      // Should show status badge
      await expect(page.locator('.status-badge')).toBeVisible()
    })

    test('should display member details section', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile')

      // Wait for data to load
      await page.waitForTimeout(2000)

      // Should show profile info rows
      const infoLabels = page.locator('.info-label')
      const count = await infoLabels.count()
      expect(count).toBeGreaterThanOrEqual(3) // At least name, phone, email
    })

    test('should display stats card', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile')

      await page.waitForTimeout(2000)

      // Should show stats (membership duration, contract status, branch)
      const statsCard = page.locator('.stats-card')
      if (await statsCard.isVisible({ timeout: 3000 })) {
        const statLabels = statsCard.locator('.stat-label')
        const count = await statLabels.count()
        expect(count).toBeGreaterThanOrEqual(2)
      }
    })

    test('should show menu items for navigation', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile')

      // Check for menu items
      await expect(page.locator('text=健身追蹤')).toBeVisible()
      await expect(page.locator('text=通知設定')).toBeVisible()
      await expect(page.locator('text=問題回報')).toBeVisible()
    })

    test('should enter edit mode', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile')

      await page.waitForTimeout(2000)

      // Click edit button
      const editBtn = page.locator('.edit-btn, button:has-text("編輯")')
      if (await editBtn.isVisible({ timeout: 3000 })) {
        await editBtn.click()

        // Should show edit form with inputs
        await expect(page.locator('#edit-name, input[placeholder*="姓名"]')).toBeVisible()
        await expect(page.locator('#edit-phone, input[placeholder*="0912"]')).toBeVisible()

        // Should show save and cancel buttons
        await expect(page.locator('.btn-save, button:has-text("儲存")')).toBeVisible()
        await expect(page.locator('.btn-cancel, button:has-text("取消")')).toBeVisible()
      }
    })

    test('should cancel edit mode', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile')

      await page.waitForTimeout(2000)

      const editBtn = page.locator('.edit-btn, button:has-text("編輯")')
      if (await editBtn.isVisible({ timeout: 3000 })) {
        await editBtn.click()

        // Click cancel
        await page.click('.btn-cancel, button:has-text("取消")')

        // Should return to view mode
        await expect(page.locator('.info-card, .info-row')).toBeVisible()
      }
    })

    test('should have theme settings', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile')

      // Should show theme options (淺色, 深色, 系統)
      await expect(page.locator('text=外觀主題').or(page.locator('text=外觀設定'))).toBeVisible()
      await expect(page.locator('.theme-selector, .theme-option')).toBeVisible()
    })

    test('should navigate to fitness tracking', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile')

      // Click fitness menu item
      await page.click('text=健身追蹤')

      await expect(page).toHaveURL(/fitness/, { timeout: 5000 })
    })

    test('should show logout button', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile')

      // Should show logout
      await expect(page.locator('text=登出')).toBeVisible()
    })
  })
})
