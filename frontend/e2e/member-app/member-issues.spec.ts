/**
 * E2E Tests for Member Issue Reports
 * Seed data has no issues for member1, so the empty state is asserted.
 */
import { test, expect } from '@playwright/test'
import { loginAsMember, goto } from '../fixtures/auth'

test.describe('Member Issue Reports', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMember(page)
  })

  test.describe('Issues List Page', () => {
    test.beforeEach(async ({ page }) => {
      await goto(page, '/profile/issues')
    })

    test('should display issues page with tabs and empty state', async ({ page }) => {
      await expect(page.getByRole('heading', { level: 1, name: '問題回報' })).toBeVisible()
      await expect(page.getByRole('button', { name: /處理中/ })).toHaveClass(/active/)
      await expect(page.getByRole('heading', { name: '沒有處理中的問題' })).toBeVisible()
    })

    test('should switch to resolved tab', async ({ page }) => {
      const resolvedTab = page.getByRole('button', { name: '已結案' })
      await resolvedTab.click()

      await expect(resolvedTab).toHaveClass(/active/)
      await expect(page.getByRole('heading', { name: '沒有已結案的問題' })).toBeVisible()
    })

    test('should navigate back to profile', async ({ page }) => {
      await page.locator('a.back-btn').click()

      await expect(page).toHaveURL(/\/profile$/)
    })

    test('should navigate to new issue form', async ({ page }) => {
      await page.locator('.add-btn').click()

      await expect(page).toHaveURL(/\/profile\/issues\/new$/)
    })
  })

  test.describe('New Issue Page', () => {
    test('should display the new issue form', async ({ page }) => {
      await goto(page, '/profile/issues/new')

      await expect(page.getByRole('heading', { level: 1, name: '提交問題' })).toBeVisible()
      await expect(page.getByLabel('標題')).toBeVisible()
      await expect(page.getByLabel('詳細說明')).toBeVisible()
      await expect(page.getByRole('button', { name: '提交問題' })).toBeVisible()
    })
  })
})
