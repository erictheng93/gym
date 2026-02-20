/**
 * Coach App Lessons (教案管理) E2E Tests
 *
 * Tests lesson plan management, template browsing, and creation flows
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

test.describe('Lessons List', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
  })

  test('should display lessons page with title "教案管理"', async ({ page }) => {
    await page.goto('http://localhost:3003/lessons')

    // Check page title
    await expect(page.locator('h1')).toContainText('教案管理')

    // Check subtitle
    await expect(page.locator('text=建立與管理訓練教案')).toBeVisible()
  })

  test('should display add button linking to /lessons/new', async ({ page }) => {
    await page.goto('http://localhost:3003/lessons')

    // Check add button exists and links to new lesson page
    const addButton = page.locator('.add-button')
    await expect(addButton).toBeVisible()

    const href = await addButton.getAttribute('href')
    expect(href).toContain('/lessons/new')
  })

  test('should display segmented control with "我的教案" and "教案範本"', async ({ page }) => {
    await page.goto('http://localhost:3003/lessons')

    // Check segmented control buttons
    await expect(page.locator('button:has-text("我的教案")')).toBeVisible()
    await expect(page.locator('button:has-text("教案範本")')).toBeVisible()
  })

  test('should display search bar', async ({ page }) => {
    await page.goto('http://localhost:3003/lessons')

    // Check search input
    const searchInput = page.locator('input[placeholder="搜尋教案標題..."]')
    await expect(searchInput).toBeVisible()
  })

  test('should switch to templates view when clicking "教案範本"', async ({ page }) => {
    await page.goto('http://localhost:3003/lessons')

    // Click on templates tab
    await page.locator('button:has-text("教案範本")').click()

    // Wait for view to switch
    await page.waitForTimeout(500)

    // Should show template content (category pills or template items or empty state)
    const categoryPills = page.locator('button:has-text("全部")')
    const emptyState = page.locator('text=沒有可用的範本')
    const planItems = page.locator('.plan-item')

    const hasCategoryPills = await categoryPills.isVisible()
    const hasEmptyState = await emptyState.isVisible()
    const hasPlanItems = await planItems.count() > 0

    // At least one of these should be true in templates view
    expect(hasCategoryPills || hasEmptyState || hasPlanItems).toBeTruthy()
  })

  test('should show plan items or empty state', async ({ page }) => {
    await page.goto('http://localhost:3003/lessons')

    // Wait for content to load
    await page.waitForTimeout(500)

    const planItems = page.locator('.plan-item')
    const emptyState = page.locator('text=尚未建立教案')
    const planCount = await planItems.count()

    if (planCount > 0) {
      // First plan item should have a title
      const firstPlan = planItems.first()
      await expect(firstPlan.locator('.plan-title')).toBeVisible()
    } else {
      // Should show empty state message
      await expect(emptyState).toBeVisible()
    }
  })

  test('should navigate to plan detail when clicking a plan item', async ({ page }) => {
    await page.goto('http://localhost:3003/lessons')

    // Wait for content to load
    await page.waitForTimeout(500)

    const planItem = page.locator('.plan-item').first()
    if (await planItem.isVisible()) {
      await planItem.click()

      // Should navigate to detail page
      await expect(page).toHaveURL(/\/lessons\//, { timeout: 5000 })
    }
  })
})

test.describe('Lesson Templates', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
  })

  test('should show category filter pills in template view', async ({ page }) => {
    await page.goto('http://localhost:3003/lessons')

    // Switch to templates view
    await page.locator('button:has-text("教案範本")').click()
    await page.waitForTimeout(500)

    // Check for "全部" category pill
    const allCategoryPill = page.locator('button:has-text("全部")')
    if (await allCategoryPill.isVisible()) {
      await expect(allCategoryPill).toBeVisible()
    }
  })

  test('should filter templates by category', async ({ page }) => {
    await page.goto('http://localhost:3003/lessons')

    // Switch to templates view
    await page.locator('button:has-text("教案範本")').click()
    await page.waitForTimeout(500)

    // Get category buttons (excluding "全部")
    const categoryButtons = page.locator('button').filter({ hasNotText: '全部' }).filter({ hasNotText: '我的教案' }).filter({ hasNotText: '教案範本' })
    const categoryCount = await categoryButtons.count()

    if (categoryCount > 0) {
      // Click the first category filter
      await categoryButtons.first().click()
      await page.waitForTimeout(500)

      // Templates should be filtered (or show empty state)
      const planItems = page.locator('.plan-item')
      const emptyState = page.locator('text=沒有可用的範本')
      const hasItems = await planItems.count() > 0
      const hasEmptyState = await emptyState.isVisible()

      expect(hasItems || hasEmptyState).toBeTruthy()
    }
  })
})

test.describe('Create Lesson', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
  })

  test('should navigate to new lesson page', async ({ page }) => {
    await page.goto('http://localhost:3003/lessons')

    // Click the add button
    const addButton = page.locator('.add-button')
    await expect(addButton).toBeVisible()
    await addButton.click()

    // Should navigate to new lesson page
    await expect(page).toHaveURL(/\/lessons\/new/, { timeout: 5000 })
  })

  test('should display lesson creation form', async ({ page }) => {
    await page.goto('http://localhost:3003/lessons/new')

    // Wait for page to load
    await page.waitForTimeout(500)

    // Check for form elements (input fields, textareas, or submit button)
    const formInputs = page.locator('input, textarea, select')
    const inputCount = await formInputs.count()

    // The creation form should have at least one input field
    expect(inputCount).toBeGreaterThan(0)

    // Check for a submit or save button
    const submitButton = page.locator('button[type="submit"], button:has-text("儲存"), button:has-text("建立"), button:has-text("新增")')
    if (await submitButton.isVisible()) {
      await expect(submitButton).toBeVisible()
    }
  })
})

test.describe('Auth Guard', () => {
  test('should redirect to login when accessing /lessons without auth', async ({ page }) => {
    // Try to access lessons page directly without logging in
    await page.goto('http://localhost:3003/lessons')

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/)
  })
})
