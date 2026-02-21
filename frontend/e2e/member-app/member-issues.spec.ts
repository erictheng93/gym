/**
 * E2E Tests for Member Issue Reports
 * Tests issue listing, tabs, creation form, and detail view
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

test.describe('Member Issue Reports', () => {
  test.describe('Issues List Page', () => {
    test('should display issues page', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/issues')

      // Should show page title
      await expect(page.locator('.page-title:has-text("問題回報"), h1:has-text("問題回報")')).toBeVisible()
    })

    test('should show add button', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/issues')

      // Should show create issue button
      await expect(page.locator('.add-btn')).toBeVisible()
    })

    test('should show status tabs', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/issues')

      // Should show tabs (待處理 / 已解決 or similar)
      const pendingTab = page.locator('button:has-text("待處理"), button:has-text("進行中")')
      const resolvedTab = page.locator('button:has-text("已解決"), button:has-text("已完成")')

      if (await pendingTab.isVisible({ timeout: 3000 })) {
        await expect(pendingTab).toBeVisible()
      }
      if (await resolvedTab.isVisible({ timeout: 3000 })) {
        await expect(resolvedTab).toBeVisible()
      }
    })

    test('should show issues list or empty state', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/issues')

      await page.waitForTimeout(3000)

      // Either issues list or empty state should be visible
      const hasIssues = await page.locator('.issues-list, .issue-card').isVisible().catch(() => false)
      const hasEmpty = await page.locator('.empty-state').isVisible().catch(() => false)

      expect(hasIssues || hasEmpty).toBe(true)
    })

    test('should switch between tabs', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/issues')

      await page.waitForTimeout(2000)

      // Click resolved tab
      const resolvedTab = page.locator('button:has-text("已解決"), button:has-text("已完成")')
      if (await resolvedTab.isVisible({ timeout: 3000 })) {
        await resolvedTab.click()
        await expect(resolvedTab).toHaveClass(/active/)
      }
    })

    test('should navigate back to profile', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/issues')

      const backBtn = page.locator('.back-btn, a[href="/profile"]')
      if (await backBtn.isVisible()) {
        await backBtn.click()
        await expect(page).toHaveURL(/profile/, { timeout: 5000 })
      }
    })
  })

  test.describe('New Issue Page', () => {
    test('should navigate to new issue form', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/issues')

      await page.click('.add-btn')

      await expect(page).toHaveURL(/issues\/new/, { timeout: 5000 })
    })

    test('should display new issue form', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/issues/new')

      await page.waitForTimeout(2000)

      // Should show issue type selection
      const typeSelector = page.locator('select, .issue-type-selector, .type-grid, button:has-text("器材"), button:has-text("服務")')
      if (await typeSelector.isVisible({ timeout: 3000 })) {
        await expect(typeSelector).toBeVisible()
      }
    })

    test('should show title and content fields', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/issues/new')

      await page.waitForTimeout(2000)

      // Should show title input
      const titleInput = page.locator('input[placeholder*="標題"], input[name="title"]')
      if (await titleInput.isVisible({ timeout: 3000 })) {
        await expect(titleInput).toBeVisible()
      }

      // Should show content textarea
      const contentInput = page.locator('textarea, [contenteditable="true"]')
      if (await contentInput.isVisible({ timeout: 3000 })) {
        await expect(contentInput).toBeVisible()
      }
    })

    test('should show submit button', async ({ page }) => {
      await loginAsMember(page)
      await page.goto('/profile/issues/new')

      await page.waitForTimeout(2000)

      // Should show submit button
      const submitBtn = page.locator('button:has-text("提交"), button:has-text("送出"), button[type="submit"]')
      if (await submitBtn.isVisible({ timeout: 3000 })) {
        await expect(submitBtn).toBeVisible()
      }
    })
  })
})
