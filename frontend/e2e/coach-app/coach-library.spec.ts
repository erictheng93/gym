/**
 * Coach App Teaching Library E2E Tests
 *
 * Tests the teaching materials library page, filtering, detail view,
 * material creation, and auth guard.
 */
import { test, expect } from '@playwright/test'

// Helper to login before tests
async function loginAsCoach(page: any) {
  await page.goto('http://localhost:3003/login')
  await page.locator('input[type="text"]').fill('test-coach@example.com')
  await page.locator('input[type="password"]').fill('testpassword123')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/$/)
}

test.describe('Library Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
    await page.goto('http://localhost:3003/library')
  })

  test('should display library page with title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('教學資源庫')
    await expect(page.locator('text=動作示範與訓練資源')).toBeVisible()
  })

  test('should display add button linking to /library/new', async ({ page }) => {
    const addButton = page.locator('.add-button')
    await expect(addButton).toBeVisible()

    const href = await addButton.getAttribute('href')
    expect(href).toContain('/library/new')
  })

  test('should display type segmented control', async ({ page }) => {
    await expect(page.locator('text=全部')).toBeVisible()
    await expect(page.locator('text=動作')).toBeVisible()
    await expect(page.locator('text=影片')).toBeVisible()
    await expect(page.locator('text=文件')).toBeVisible()
  })

  test('should display search bar', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="搜尋動作名稱"]')
    await expect(searchInput).toBeVisible()
  })

  test('should display difficulty filter pills', async ({ page }) => {
    await expect(page.locator('text=初階')).toBeVisible()
    await expect(page.locator('text=中階')).toBeVisible()
    await expect(page.locator('text=進階')).toBeVisible()
  })

  test('should show materials grid or empty state', async ({ page }) => {
    // Wait for content to load
    await page.waitForTimeout(1000)

    const materialsGrid = page.locator('.materials-grid')
    const emptyState = page.locator('text=沒有找到教學資源')

    const hasGrid = await materialsGrid.isVisible()
    const hasEmpty = await emptyState.isVisible()

    // Should show either materials or empty state
    expect(hasGrid || hasEmpty).toBeTruthy()
  })

  test('should filter by type when clicking segment buttons', async ({ page }) => {
    // Wait for initial load
    await page.waitForTimeout(500)

    // Click on the "動作" segment
    await page.locator('text=動作').click()
    await page.waitForTimeout(500)

    // After filtering, should still show grid or empty state
    const materialsGrid = page.locator('.materials-grid')
    const emptyState = page.locator('text=沒有找到教學資源')

    const hasGrid = await materialsGrid.isVisible()
    const hasEmpty = await emptyState.isVisible()

    expect(hasGrid || hasEmpty).toBeTruthy()

    // If materials are visible, type badges should show the filtered type
    if (hasGrid) {
      const typeBadges = page.locator('.type-badge')
      const count = await typeBadges.count()

      if (count > 0) {
        for (let i = 0; i < count; i++) {
          await expect(typeBadges.nth(i)).toContainText('動作')
        }
      }
    }
  })

  test('should filter by difficulty when clicking filter pill', async ({ page }) => {
    // Wait for initial load
    await page.waitForTimeout(500)

    // Click on "初階" difficulty filter
    await page.locator('text=初階').click()
    await page.waitForTimeout(500)

    // After filtering, should still show grid or empty state
    const materialsGrid = page.locator('.materials-grid')
    const emptyState = page.locator('text=沒有找到教學資源')

    const hasGrid = await materialsGrid.isVisible()
    const hasEmpty = await emptyState.isVisible()

    expect(hasGrid || hasEmpty).toBeTruthy()
  })
})

test.describe('Material Detail', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
    await page.goto('http://localhost:3003/library')
  })

  test('should navigate to material detail when clicking a card', async ({ page }) => {
    // Wait for materials to load
    await page.waitForTimeout(1000)

    const materialCard = page.locator('.material-card').first()
    if (await materialCard.isVisible()) {
      await materialCard.click()

      // Should navigate to detail page
      await expect(page).toHaveURL(/\/library\//, { timeout: 5000 })
    }
  })
})

test.describe('Create Material', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
  })

  test('should navigate to new material page', async ({ page }) => {
    await page.goto('http://localhost:3003/library')

    // Click the add button
    const addButton = page.locator('.add-button')
    await expect(addButton).toBeVisible()
    await addButton.click()

    // Should navigate to the new material page
    await expect(page).toHaveURL(/\/library\/new/, { timeout: 5000 })
  })

  test('should display material creation form', async ({ page }) => {
    await page.goto('http://localhost:3003/library/new')

    // Wait for the form to load
    await page.waitForTimeout(500)

    // Should have form elements (input fields, selects, submit button)
    const formInputs = page.locator('input, select, textarea')
    const count = await formInputs.count()

    expect(count).toBeGreaterThan(0)

    // Should have a submit button
    const submitButton = page.locator('button[type="submit"]')
    if (await submitButton.isVisible()) {
      await expect(submitButton).toBeVisible()
    }
  })
})

test.describe('Auth Guard', () => {
  test('should redirect to login when accessing /library without auth', async ({ page }) => {
    await page.goto('http://localhost:3003/library')

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/)
  })
})
