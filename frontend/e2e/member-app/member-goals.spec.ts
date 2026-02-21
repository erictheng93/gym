/**
 * E2E Tests for Member Fitness Goals
 * Tests goal listing, tabs, creation form, and navigation
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

test.describe('Member Fitness Goals', () => {
  test.describe('Goals List Page', () => {
    test('should display goals page', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/goals')

      // Should show page title
      await expect(page.locator('.page-title:has-text("健身目標"), h1:has-text("健身目標")')).toBeVisible()
    })

    test('should show add button', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/goals')

      // Should show add goal button
      await expect(page.locator('.add-btn')).toBeVisible()
    })

    test('should show status tabs', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/goals')

      // Should show tabs (進行中, 已達成, 已放棄)
      await expect(page.locator('button:has-text("進行中")')).toBeVisible()
      await expect(page.locator('button:has-text("已達成")')).toBeVisible()
      await expect(page.locator('button:has-text("已放棄")')).toBeVisible()
    })

    test('should default to active tab', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/goals')

      // Active tab should be selected by default
      const activeTab = page.locator('button:has-text("進行中")')
      await expect(activeTab).toHaveClass(/active/)
    })

    test('should show goals list or empty state', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/goals')

      await page.waitForTimeout(3000)

      // Either goals list or empty state should be visible
      const hasGoals = await page.locator('.goals-list').isVisible().catch(() => false)
      const hasEmpty = await page.locator('.empty-state').isVisible().catch(() => false)

      expect(hasGoals || hasEmpty).toBe(true)
    })

    test('should switch between tabs', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/goals')

      await page.waitForTimeout(2000)

      // Click achieved tab
      const achievedTab = page.locator('button:has-text("已達成")')
      await achievedTab.click()
      await expect(achievedTab).toHaveClass(/active/)

      // Click abandoned tab
      const abandonedTab = page.locator('button:has-text("已放棄")')
      await abandonedTab.click()
      await expect(abandonedTab).toHaveClass(/active/)

      // Switch back to active
      const activeTab = page.locator('button:has-text("進行中")')
      await activeTab.click()
      await expect(activeTab).toHaveClass(/active/)
    })

    test('should show empty state with create button for active tab', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/goals')

      await page.waitForTimeout(3000)

      const emptyState = page.locator('.empty-state')
      if (await emptyState.isVisible()) {
        // Should show "設定目標" button in empty state
        await expect(page.locator('button:has-text("設定目標")')).toBeVisible()
      }
    })

    test('should navigate to back link', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/goals')

      const backBtn = page.locator('.back-btn, a[href="/fitness"]')
      if (await backBtn.isVisible()) {
        await backBtn.click()
        await expect(page).toHaveURL(/fitness/, { timeout: 5000 })
      }
    })
  })

  test.describe('New Goal Page', () => {
    test('should navigate to new goal form', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/goals')

      await page.click('.add-btn')

      await expect(page).toHaveURL(/goals\/new/, { timeout: 5000 })
    })

    test('should display new goal form', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/goals/new')

      // Should show goal type selection or form
      await page.waitForTimeout(2000)

      const formElements = page.locator('select, input, .goal-type-selector, button[type="submit"]')
      const count = await formElements.count()
      expect(count).toBeGreaterThanOrEqual(1)
    })
  })
})
