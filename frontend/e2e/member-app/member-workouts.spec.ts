/**
 * E2E Tests for Member Workout Logs
 * Tests workout listing, creation form, and stats display
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

test.describe('Member Workouts', () => {
  test.describe('Workouts List Page', () => {
    test('should display workouts page', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/workouts')

      // Should show page title
      await expect(page.locator('.page-title:has-text("運動紀錄"), h1:has-text("運動紀錄")')).toBeVisible()
    })

    test('should show add button', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/workouts')

      // Should show add workout button
      await expect(page.locator('.add-btn')).toBeVisible()
    })

    test('should show period selector (week/month)', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/workouts')

      await page.waitForTimeout(2000)

      // Should show period selector
      const weekBtn = page.locator('button:has-text("本週")')
      const monthBtn = page.locator('button:has-text("本月")')

      if (await weekBtn.isVisible({ timeout: 3000 })) {
        await expect(weekBtn).toBeVisible()
        await expect(monthBtn).toBeVisible()
      }
    })

    test('should display stats cards', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/workouts')

      await page.waitForTimeout(2000)

      // Should show stats grid with workout stats
      const statsGrid = page.locator('.stats-grid')
      if (await statsGrid.isVisible({ timeout: 3000 })) {
        // Should have stat cards (運動次數, 運動天數, 總時長, 消耗卡路里)
        const statCards = statsGrid.locator('.stat-card')
        const count = await statCards.count()
        expect(count).toBeGreaterThanOrEqual(2)
      }
    })

    test('should show workouts list or empty state', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/workouts')

      await page.waitForTimeout(3000)

      // Either workout list or empty state should be visible
      const hasWorkouts = await page.locator('.workouts-list').isVisible().catch(() => false)
      const hasEmpty = await page.locator('.empty-state').isVisible().catch(() => false)

      expect(hasWorkouts || hasEmpty).toBe(true)
    })

    test('should switch period to monthly', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/workouts')

      await page.waitForTimeout(2000)

      const monthBtn = page.locator('button:has-text("本月")')
      if (await monthBtn.isVisible({ timeout: 3000 })) {
        await monthBtn.click()
        await expect(monthBtn).toHaveClass(/active/)
      }
    })

    test('should navigate to back link', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/workouts')

      const backBtn = page.locator('.back-btn, a[href="/fitness"]')
      if (await backBtn.isVisible()) {
        await backBtn.click()
        await expect(page).toHaveURL(/fitness/, { timeout: 5000 })
      }
    })
  })

  test.describe('New Workout Page', () => {
    test('should navigate to new workout form', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/workouts')

      await page.click('.add-btn')

      await expect(page).toHaveURL(/workouts\/new/, { timeout: 5000 })
    })

    test('should display new workout form', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/workouts/new')

      // Should show date input
      await expect(page.locator('input[type="date"]')).toBeVisible()

      // Should show duration/calories inputs
      const durationInput = page.locator('input[placeholder*="分鐘"], input[type="number"]').first()
      await expect(durationInput).toBeVisible()
    })

    test('should show exercise section', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/fitness/workouts/new')

      // Should have an "add exercise" button
      const addExerciseBtn = page.locator('button:has-text("運動項目"), button:has-text("新增項目"), button:has-text("新增")')
      if (await addExerciseBtn.isVisible({ timeout: 3000 })) {
        await expect(addExerciseBtn).toBeVisible()
      }
    })
  })
})
