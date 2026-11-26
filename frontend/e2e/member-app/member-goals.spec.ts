/**
 * E2E Tests for Member Fitness Goals
 * Seed data has no goals for member1, so the empty state is asserted.
 */
import { test, expect } from '@playwright/test'
import { loginAsMember } from '../fixtures/auth'

test.describe('Member Fitness Goals', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMember(page)
    await page.goto('/fitness/goals')
  })

  test('should display goals page with status tabs', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: '健身目標' })).toBeVisible()
    await expect(page.getByRole('button', { name: /進行中/ })).toHaveClass(/active/)
    await expect(page.getByRole('button', { name: '已達成' })).toBeVisible()
    await expect(page.getByRole('button', { name: '已放棄' })).toBeVisible()
  })

  test('should show empty state with create button on active tab', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '沒有進行中的目標' })).toBeVisible()
    await expect(page.getByRole('button', { name: '設定目標' })).toBeVisible()
  })

  test('should switch between tabs', async ({ page }) => {
    const achievedTab = page.getByRole('button', { name: '已達成' })
    await achievedTab.click()
    await expect(achievedTab).toHaveClass(/active/)
    await expect(page.getByRole('heading', { name: '還沒有達成的目標' })).toBeVisible()

    const abandonedTab = page.getByRole('button', { name: '已放棄' })
    await abandonedTab.click()
    await expect(abandonedTab).toHaveClass(/active/)
    await expect(page.getByRole('heading', { name: '沒有放棄的目標' })).toBeVisible()
  })

  test('should navigate back to fitness page', async ({ page }) => {
    await page.locator('a.back-btn').click()
    await expect(page).toHaveURL(/\/fitness$/)
  })

  test('should navigate to new goal form and show its fields', async ({ page }) => {
    await page.locator('.add-btn').click()

    await expect(page).toHaveURL(/\/fitness\/goals\/new$/)
    await expect(page.getByRole('heading', { name: '設定目標' })).toBeVisible()
    await expect(page.getByLabel('目標描述')).toBeVisible()
    await expect(page.getByLabel('目標日期（選填）')).toBeVisible()
  })
})
