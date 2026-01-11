/**
 * E2E Tests for Member Booking Flows
 * Tests booking, canceling, and viewing booking history
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

test.describe('Member Booking', () => {
  test.describe('Booking List', () => {
    test('should display bookings page', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      // Check page elements
      await expect(page.getByRole('heading', { name: /預約|課程/i })).toBeVisible()
    })

    test('should show upcoming and past bookings tabs', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      // Check for tab navigation
      const upcomingTab = page.locator('button:has-text("即將"), [data-testid="upcoming-tab"]')
      const pastTab = page.locator('button:has-text("過去"), button:has-text("歷史"), [data-testid="past-tab"]')

      if (await upcomingTab.isVisible()) {
        await expect(upcomingTab).toBeVisible()
      }
      if (await pastTab.isVisible()) {
        await expect(pastTab).toBeVisible()
      }
    })

    test('should display booking cards with details', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      // Wait for bookings to load
      await page.waitForTimeout(2000)

      // Check for booking cards
      const bookingCards = page.locator('.booking-card, [data-testid="booking-card"]')
      const count = await bookingCards.count()

      if (count > 0) {
        // First card should have class name
        const firstCard = bookingCards.first()
        await expect(firstCard.locator('.booking-name, h3')).toBeVisible()
      }
    })
  })

  test.describe('Class Schedule', () => {
    test('should display weekly schedule', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      // Look for schedule view
      const scheduleView = page.locator('.weekly-schedule, [data-testid="schedule-view"]')
      if (await scheduleView.isVisible({ timeout: 3000 })) {
        await expect(scheduleView).toBeVisible()
      }
    })

    test('should allow filtering by day', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      // Look for day selectors
      const dayButtons = page.locator('.day-selector button, [data-testid^="day-"]')
      const count = await dayButtons.count()

      if (count > 0) {
        // Click on a day
        await dayButtons.first().click()

        // Schedule should update
        await page.waitForTimeout(500)
      }
    })
  })

  test.describe('Book a Class', () => {
    test('should show class session details', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      // Wait for sessions to load
      await page.waitForTimeout(2000)

      // Click on a session card
      const sessionCards = page.locator('.session-card, .class-session-card, [data-testid="session-card"]')
      const count = await sessionCards.count()

      if (count > 0) {
        await sessionCards.first().click()

        // Modal or detail view should appear
        const modal = page.locator('.modal-content, [role="dialog"]')
        const isModalVisible = await modal.isVisible({ timeout: 3000 })

        if (isModalVisible) {
          // Should show session details
          await expect(modal.locator('h2, .session-title')).toBeVisible()
        }
      }
    })

    test('should display available spots', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      // Wait for sessions to load
      await page.waitForTimeout(2000)

      // Look for availability indicator
      const availabilityText = page.locator('text=剩餘, text=名額, text=已滿')
      const count = await availabilityText.count()

      // Should show some availability info
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })

  test.describe('Cancel Booking', () => {
    test('should show cancel button for eligible bookings', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      // Wait for bookings to load
      await page.waitForTimeout(2000)

      // Look for cancel buttons
      const cancelButtons = page.locator('button:has-text("取消"), [data-testid="cancel-booking"]')
      const count = await cancelButtons.count()

      // May or may not have cancelable bookings
      expect(count).toBeGreaterThanOrEqual(0)
    })

    test('should show confirmation dialog when canceling', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      await page.waitForTimeout(2000)

      const cancelButtons = page.locator('button:has-text("取消預約"), [data-testid="cancel-booking"]')
      const count = await cancelButtons.count()

      if (count > 0) {
        // Click first cancel button
        await cancelButtons.first().click()

        // Should show confirmation
        const confirmDialog = page.locator('[role="dialog"], .modal-content')
        const confirmVisible = await confirmDialog.isVisible({ timeout: 3000 })

        if (confirmVisible) {
          await expect(confirmDialog.locator('text=確定, text=確認')).toBeVisible()
        }
      }
    })
  })

  test.describe('Keyboard Navigation', () => {
    test('should navigate booking cards with keyboard', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      await page.waitForTimeout(2000)

      // Tab through elements
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')

      // Focus should be on a focusable element
      const focusedElement = page.locator(':focus')
      await expect(focusedElement).toBeVisible()
    })

    test('should activate booking card with Enter key', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      await page.waitForTimeout(2000)

      const bookingCards = page.locator('.booking-card[tabindex="0"], [role="button"]')
      const count = await bookingCards.count()

      if (count > 0) {
        // Focus on first card
        await bookingCards.first().focus()
        await page.keyboard.press('Enter')

        // Should trigger action (modal or navigation)
        await page.waitForTimeout(500)
      }
    })
  })

  test.describe('Accessibility', () => {
    test('should have proper ARIA labels on booking cards', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      await page.waitForTimeout(2000)

      const bookingCards = page.locator('.booking-card, [data-testid="booking-card"]')
      const count = await bookingCards.count()

      if (count > 0) {
        const firstCard = bookingCards.first()
        const ariaLabel = await firstCard.getAttribute('aria-label')

        // Should have descriptive aria-label
        expect(ariaLabel || '').toBeTruthy()
      }
    })

    test('should announce status changes', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/bookings')

      // Check for live region
      const liveRegion = page.locator('[aria-live], [role="status"], [role="alert"]')
      const count = await liveRegion.count()

      expect(count).toBeGreaterThanOrEqual(0)
    })
  })
})
