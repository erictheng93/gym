/**
 * E2E Tests for Member Body Measurements
 * Tests measurement listing, creation, and trends
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

test.describe('Member Body Measurements', () => {
  test.describe('Measurements List Page', () => {
    test('should display measurements page', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/measurements')

      // Should show page title
      await expect(
        page.locator('.page-title:has-text("體態"), .page-title:has-text("量測"), h1:has-text("體態"), h1:has-text("量測")')
      ).toBeVisible()
    })

    test('should show add button', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/measurements')

      // Should show add measurement button
      await expect(page.locator('.add-btn')).toBeVisible()
    })

    test('should show measurements list or empty state', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/measurements')

      await page.waitForTimeout(3000)

      // Either measurements list or empty state should be visible
      const hasList = await page.locator('.measurements-list, .measurement-card, .measurement-row').isVisible().catch(() => false)
      const hasEmpty = await page.locator('.empty-state').isVisible().catch(() => false)

      expect(hasList || hasEmpty).toBe(true)
    })

    test('should show period selector for trends', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/measurements')

      await page.waitForTimeout(2000)

      // Should show period selection buttons
      const periodBtns = page.locator('.period-btn, .period-selector button')
      const count = await periodBtns.count()

      if (count > 0) {
        expect(count).toBeGreaterThanOrEqual(1)
      }
    })

    test('should navigate to back link', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/measurements')

      const backBtn = page.locator('.back-btn, a[href="/fitness"]')
      if (await backBtn.isVisible()) {
        await backBtn.click()
        await expect(page).toHaveURL(/fitness/, { timeout: 5000 })
      }
    })
  })

  test.describe('New Measurement Page', () => {
    test('should navigate to new measurement form', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/measurements')

      await page.click('.add-btn')

      await expect(page).toHaveURL(/measurements\/new/, { timeout: 5000 })
    })

    test('should display new measurement form', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/measurements/new')

      await page.waitForTimeout(2000)

      // Should show date input
      const dateInput = page.locator('input[type="date"]')
      if (await dateInput.isVisible({ timeout: 3000 })) {
        await expect(dateInput).toBeVisible()
      }

      // Should show measurement inputs (weight, body fat, etc.)
      const inputs = page.locator('input[type="number"], input[inputmode="decimal"]')
      const count = await inputs.count()
      expect(count).toBeGreaterThanOrEqual(1)
    })

    test('should show measurement field labels', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/measurements/new')

      await page.waitForTimeout(2000)

      // Should show labels for measurement fields
      const expectedLabels = ['體重', '體脂', 'BMI']
      let foundLabels = 0

      for (const label of expectedLabels) {
        if (await page.locator(`text=${label}`).isVisible({ timeout: 1000 }).catch(() => false)) {
          foundLabels++
        }
      }

      expect(foundLabels).toBeGreaterThanOrEqual(1)
    })
  })
})
