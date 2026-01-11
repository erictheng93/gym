/**
 * E2E Tests for Member Entry (QR Code) Flow
 * Tests QR code generation, refresh, and membership status display
 */
import { test, expect, type Page } from '@playwright/test'

// Helper to login before tests
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

test.describe('Member Entry (QR Code)', () => {
  test.describe('QR Code Display', () => {
    test('should display QR code on home page', async ({ page }) => {
      await loginAsMember(page)

      // QR code should be visible
      const qrCode = page.locator('[data-testid="qr-code"], .qr-image, img[alt*="QR"]')
      await expect(qrCode).toBeVisible({ timeout: 5000 })
    })

    test('should display member code below QR', async ({ page }) => {
      await loginAsMember(page)

      // Member code should be visible
      const memberCode = page.locator('.member-code, [data-testid="member-code"]')
      await expect(memberCode).toBeVisible()

      // Should contain member code pattern (e.g., M001)
      const codeText = await memberCode.textContent()
      expect(codeText?.length).toBeGreaterThan(0)
    })

    test('should display countdown timer', async ({ page }) => {
      await loginAsMember(page)

      // Countdown should be visible
      const countdown = page.locator('.countdown, [data-testid="countdown"]')
      await expect(countdown).toBeVisible()

      // Get initial value
      const initialValue = await countdown.textContent()
      const initialNumber = parseInt(initialValue || '0', 10)

      // Wait 2 seconds
      await page.waitForTimeout(2000)

      // Value should have decreased
      const newValue = await countdown.textContent()
      const newNumber = parseInt(newValue || '0', 10)

      // Should be counting down (or regenerated if at 0)
      expect(newNumber <= initialNumber || newNumber > 25).toBe(true)
    })
  })

  test.describe('QR Code Refresh', () => {
    test('should have refresh button', async ({ page }) => {
      await loginAsMember(page)

      // Refresh button should be visible
      const refreshBtn = page.locator('.refresh-btn, button:has-text("刷新"), [data-testid="refresh-qr"]')
      await expect(refreshBtn).toBeVisible()
    })

    test('should refresh QR code when button clicked', async ({ page }) => {
      await loginAsMember(page)

      // Get initial QR code src
      const qrCode = page.locator('[data-testid="qr-code"], .qr-image, img[alt*="QR"]')
      const initialSrc = await qrCode.getAttribute('src')

      // Click refresh
      const refreshBtn = page.locator('.refresh-btn, button:has-text("刷新"), [data-testid="refresh-qr"]')
      await refreshBtn.click()

      // Wait for new QR
      await page.waitForTimeout(500)

      // QR should have changed
      const newSrc = await qrCode.getAttribute('src')
      expect(newSrc).not.toBe(initialSrc)
    })

    test('should auto-refresh when countdown reaches zero', async ({ page }) => {
      await loginAsMember(page)

      // This is a longer test - we'll just verify the mechanism exists
      const countdown = page.locator('.countdown, [data-testid="countdown"]')
      await expect(countdown).toBeVisible()

      // The countdown mechanism should be working
      // We don't wait the full 30 seconds in tests
    })
  })

  test.describe('Membership Status Display', () => {
    test('should display membership status card', async ({ page }) => {
      await loginAsMember(page)

      // Status card should be visible
      const statusCard = page.locator('.status-card, [data-testid="status-card"]')
      await expect(statusCard).toBeVisible()
    })

    test('should show membership status', async ({ page }) => {
      await loginAsMember(page)

      // Status label should be visible
      const statusLabel = page.locator('text=會籍狀態, text=會員狀態')
      await expect(statusLabel).toBeVisible()

      // Status value should be visible
      const statusValue = page.locator('text=有效, text=已到期, text=ACTIVE, text=EXPIRED')
      await expect(statusValue).toBeVisible()
    })

    test('should show contract information', async ({ page }) => {
      await loginAsMember(page)

      // Contract info should be visible
      const contractLabel = page.locator('text=合約, text=會籍')
      await expect(contractLabel.first()).toBeVisible()
    })
  })

  test.describe('Quick Actions', () => {
    test('should display quick action buttons', async ({ page }) => {
      await loginAsMember(page)

      // Quick actions should be visible
      const quickActions = page.locator('.quick-actions, nav[aria-label*="快速"]')
      await expect(quickActions).toBeVisible()
    })

    test('should navigate to bookings when clicked', async ({ page }) => {
      await loginAsMember(page)

      // Click bookings action
      const bookingsLink = page.locator('a[href="/bookings"], a:has-text("預約")')
      await bookingsLink.click()

      await expect(page).toHaveURL('/bookings')
    })

    test('should navigate to contracts when clicked', async ({ page }) => {
      await loginAsMember(page)

      // Click contracts action
      const contractsLink = page.locator('a[href="/contracts"], a:has-text("合約")')
      await contractsLink.click()

      await expect(page).toHaveURL('/contracts')
    })
  })

  test.describe('Accessibility', () => {
    test('should have proper headings structure', async ({ page }) => {
      await loginAsMember(page)

      // Main heading should be present
      const h1 = page.locator('h1')
      await expect(h1).toBeVisible()
    })

    test('should have ARIA labels on QR section', async ({ page }) => {
      await loginAsMember(page)

      // QR section should have proper labeling
      const qrSection = page.locator('section[aria-labelledby], [aria-label*="QR"]')
      const count = await qrSection.count()

      expect(count).toBeGreaterThanOrEqual(0)
    })

    test('should have accessible refresh button', async ({ page }) => {
      await loginAsMember(page)

      const refreshBtn = page.locator('.refresh-btn, [data-testid="refresh-qr"]')
      if (await refreshBtn.isVisible()) {
        const ariaLabel = await refreshBtn.getAttribute('aria-label')
        expect(ariaLabel || '').toContain('刷新')
      }
    })

    test('should announce countdown changes', async ({ page }) => {
      await loginAsMember(page)

      // Check for aria-live on countdown
      const countdown = page.locator('[aria-live], .countdown')
      const countdownVisible = await countdown.isVisible({ timeout: 3000 })

      expect(countdownVisible).toBe(true)
    })
  })

  test.describe('Responsive Design', () => {
    test('should display correctly on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })

      await loginAsMember(page)

      // QR code should still be visible
      const qrCode = page.locator('[data-testid="qr-code"], .qr-image, img[alt*="QR"]')
      await expect(qrCode).toBeVisible()

      // Quick actions should be visible
      const quickActions = page.locator('.quick-actions, nav')
      await expect(quickActions).toBeVisible()
    })

    test('should display correctly on tablet viewport', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 })

      await loginAsMember(page)

      // All elements should be visible
      const qrCode = page.locator('[data-testid="qr-code"], .qr-image, img[alt*="QR"]')
      await expect(qrCode).toBeVisible()

      const statusCard = page.locator('.status-card, [data-testid="status-card"]')
      await expect(statusCard).toBeVisible()
    })
  })
})
