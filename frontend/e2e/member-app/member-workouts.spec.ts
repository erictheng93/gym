/**
 * E2E Tests for Member Workouts
 * Seed data has no workouts for member1, so the empty state is asserted.
 */
import { test, expect } from '@playwright/test'
import { loginAsMember } from '../fixtures/auth'

test.describe('Member Workouts', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMember(page)
  })

  test.describe('Workouts List Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/fitness/workouts')
    })

    test('should display page with period selector, stats and empty state', async ({ page }) => {
      await expect(page.getByRole('heading', { level: 1, name: '運動紀錄' })).toBeVisible()
      await expect(page.getByRole('button', { name: '本週' })).toHaveClass(/active/)
      await expect(page.getByRole('button', { name: '本月' })).toBeVisible()
      await expect(page.getByRole('heading', { name: '還沒有運動紀錄' })).toBeVisible()
    })

    test('should switch period to monthly', async ({ page }) => {
      const monthBtn = page.getByRole('button', { name: '本月' })
      await monthBtn.click()

      await expect(monthBtn).toHaveClass(/active/)
      await expect(page.getByRole('button', { name: '本週' })).not.toHaveClass(/active/)
    })

    test('should navigate back to fitness page', async ({ page }) => {
      await page.locator('a.back-btn').click()

      await expect(page).toHaveURL(/\/fitness$/)
    })

    test('should navigate to new workout form', async ({ page }) => {
      await page.locator('.add-btn').click()

      await expect(page).toHaveURL(/\/fitness\/workouts\/new$/)
    })
  })

  test.describe('New Workout Page', () => {
    test('should display new workout form fields', async ({ page }) => {
      await page.goto('/fitness/workouts/new')

      await expect(page.getByRole('heading', { level: 1, name: '記錄運動' })).toBeVisible()
      await expect(page.getByLabel('日期')).toBeVisible()
      await expect(page.locator('#duration')).toBeVisible()
      await expect(page.locator('#calories')).toBeVisible()
      await expect(page.locator('.add-exercise-btn')).toBeVisible()
    })
  })
})
