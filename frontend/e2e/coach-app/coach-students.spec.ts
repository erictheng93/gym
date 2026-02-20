/**
 * Coach App Students Management E2E Tests
 *
 * Tests student list, filtering, search, and detail navigation flows
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

test.describe('Students List', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
  })

  test('should display students page with title', async ({ page }) => {
    await page.goto('http://localhost:3003/students')

    // Check page title
    await expect(page.locator('h1')).toContainText('學員管理')
  })

  test('should display search bar', async ({ page }) => {
    await page.goto('http://localhost:3003/students')

    // Check search input exists with correct placeholder
    const searchInput = page.locator('input[type="text"][placeholder*="搜尋學員"]')
    await expect(searchInput).toBeVisible()
  })

  test('should display filter pills', async ({ page }) => {
    await page.goto('http://localhost:3003/students')

    // Check all filter pills are visible
    await expect(page.locator('button:has-text("全部")')).toBeVisible()
    await expect(page.locator('button:has-text("主教練")')).toBeVisible()
    await expect(page.locator('button:has-text("副教練")')).toBeVisible()
    await expect(page.locator('button:has-text("有效合約")')).toBeVisible()
  })

  test('should filter by role when clicking pill', async ({ page }) => {
    await page.goto('http://localhost:3003/students')

    // Click on the "主教練" filter pill
    await page.locator('button:has-text("主教練")').click()

    // Wait for filter to apply
    await page.waitForTimeout(500)

    // If student items are visible, they should have the "主教練" badge
    const studentItems = page.locator('.student-item')
    const count = await studentItems.count()

    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(studentItems.nth(i)).toContainText('主教練')
      }
    }
  })

  test('should search students by name', async ({ page }) => {
    await page.goto('http://localhost:3003/students')

    // Type a search query
    const searchInput = page.locator('input[type="text"][placeholder*="搜尋學員"]')
    await searchInput.fill('測試')

    // Wait for search results to update
    await page.waitForTimeout(500)

    // Results should update (either show matching items or empty state)
    const studentItems = page.locator('.student-item')
    const emptyState = page.locator('text=尚未有指派的學員')

    const hasStudents = await studentItems.first().isVisible().catch(() => false)
    const hasEmptyState = await emptyState.isVisible().catch(() => false)

    // Either students are shown or empty state is displayed
    expect(hasStudents || hasEmptyState).toBeTruthy()
  })

  test('should navigate to student detail when clicking a student item', async ({ page }) => {
    await page.goto('http://localhost:3003/students')

    // Click on first student item (if exists)
    const studentItem = page.locator('.student-item').first()
    if (await studentItem.isVisible()) {
      await studentItem.click()

      // Should navigate to detail page
      await expect(page).toHaveURL(/\/students\//)
    }
  })

  test('should show empty state or student list', async ({ page }) => {
    await page.goto('http://localhost:3003/students')

    // Wait for content to load
    await page.waitForTimeout(500)

    // Either student items or empty state should be visible
    const studentItems = page.locator('.student-item')
    const emptyState = page.locator('text=尚未有指派的學員')

    const hasStudents = await studentItems.first().isVisible().catch(() => false)
    const hasEmptyState = await emptyState.isVisible().catch(() => false)

    expect(hasStudents || hasEmptyState).toBeTruthy()
  })
})

test.describe('Student Detail', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
  })

  test('should navigate to student detail from list', async ({ page }) => {
    await page.goto('http://localhost:3003/students')

    const studentItem = page.locator('.student-item').first()
    if (await studentItem.isVisible()) {
      // Capture the student name before navigating
      const studentName = page.locator('.student-name').first()
      const nameText = await studentName.textContent()

      await studentItem.click()

      // Should navigate to student detail page
      await expect(page).toHaveURL(/\/students\/\d+/)

      // Detail page should contain the student name
      if (nameText) {
        await expect(page.locator('body')).toContainText(nameText)
      }
    }
  })

  test('should display student information', async ({ page }) => {
    await page.goto('http://localhost:3003/students')

    const studentItem = page.locator('.student-item').first()
    if (await studentItem.isVisible()) {
      await studentItem.click()

      // Should be on detail page
      await expect(page).toHaveURL(/\/students\//)

      // Detail page should show student information
      const heading = page.locator('h1, h2')
      await expect(heading.first()).toBeVisible()
    }
  })
})

test.describe('Auth Guard', () => {
  test('should redirect to login when accessing /students without auth', async ({ page }) => {
    // Try to access students page directly without logging in
    await page.goto('http://localhost:3003/students')

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/)
  })
})
