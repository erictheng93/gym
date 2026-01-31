/**
 * Coach App Classes & Attendance E2E Tests
 *
 * Tests class management and attendance marking flows
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

test.describe('Classes List', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
  })

  test('should display classes page', async ({ page }) => {
    await page.goto('http://localhost:3003/classes')

    // Check page title
    await expect(page.locator('h1')).toContainText('課程管理')

    // Check filter elements
    await expect(page.locator('input[type="date"]')).toBeVisible()
  })

  test('should filter classes by date', async ({ page }) => {
    await page.goto('http://localhost:3003/classes')

    // Set date filter
    const today = new Date().toISOString().split('T')[0]
    await page.locator('input[type="date"]').fill(today)

    // Wait for classes to load
    await page.waitForTimeout(500)

    // Classes should be filtered (or show empty state)
  })

  test('should filter classes by status', async ({ page }) => {
    await page.goto('http://localhost:3003/classes')

    // Click on "已預約" status filter
    await page.locator('button:has-text("已預約")').click()

    // Wait for filter to apply
    await page.waitForTimeout(500)

    // All visible class cards should have BOOKED status
    const statusBadges = page.locator('.bg-blue-100.text-blue-800')
    const count = await statusBadges.count()

    // If there are any classes, they should all be BOOKED
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(statusBadges.nth(i)).toContainText('已預約')
      }
    }
  })

  test('should navigate to class detail', async ({ page }) => {
    await page.goto('http://localhost:3003/classes')

    // Click on first class card (if exists)
    const classCard = page.locator('.bg-white.rounded-lg.shadow').first()
    if (await classCard.isVisible()) {
      await classCard.click()

      // Should navigate to detail page
      await expect(page).toHaveURL(/\/classes\//)
    }
  })
})

test.describe('Class Detail', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
  })

  test('should display class detail page', async ({ page }) => {
    // Navigate to a specific class (need to know the ID or navigate from list)
    await page.goto('http://localhost:3003/classes')

    const classCard = page.locator('.bg-white.rounded-lg.shadow').first()
    if (await classCard.isVisible()) {
      await classCard.click()

      // Check for detail elements
      await expect(page.locator('text=課程資訊')).toBeVisible()
      await expect(page.locator('text=學員資訊')).toBeVisible()
    }
  })

  test('should show attendance buttons for BOOKED class', async ({ page }) => {
    await page.goto('http://localhost:3003/classes')

    // Filter to BOOKED classes
    await page.locator('button:has-text("已預約")').click()
    await page.waitForTimeout(500)

    const classCard = page.locator('.bg-white.rounded-lg.shadow').first()
    if (await classCard.isVisible()) {
      await classCard.click()

      // Check for attendance buttons
      await expect(page.locator('button:has-text("已出席")')).toBeVisible()
      await expect(page.locator('button:has-text("未到")')).toBeVisible()
    }
  })
})

test.describe('Attendance Marking', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
  })

  test('should mark attendance as attended', async ({ page }) => {
    await page.goto('http://localhost:3003/classes')

    // Filter to BOOKED classes
    await page.locator('button:has-text("已預約")').click()
    await page.waitForTimeout(500)

    const classCard = page.locator('.bg-white.rounded-lg.shadow').first()
    if (await classCard.isVisible()) {
      await classCard.click()

      // Click "已出席" button
      await page.locator('button:has-text("已出席")').click()

      // Modal should appear
      await expect(page.locator('text=確認出席')).toBeVisible()

      // Confirm
      await page.locator('button[type="submit"]:has-text("確認")').click()

      // Should show success message
      await expect(page.locator('.bg-green-500, [class*="success"]')).toBeVisible({ timeout: 5000 })
    }
  })

  test('should mark attendance as no-show', async ({ page }) => {
    await page.goto('http://localhost:3003/classes')

    // Filter to BOOKED classes
    await page.locator('button:has-text("已預約")').click()
    await page.waitForTimeout(500)

    const classCard = page.locator('.bg-white.rounded-lg.shadow').first()
    if (await classCard.isVisible()) {
      await classCard.click()

      // Click "未到" button
      await page.locator('button:has-text("未到")').click()

      // Modal should appear
      await expect(page.locator('text=確認未到')).toBeVisible()

      // Confirm
      await page.locator('button[type="submit"]:has-text("確認")').click()

      // Should show success message
      await expect(page.locator('.bg-green-500, [class*="success"]')).toBeVisible({ timeout: 5000 })
    }
  })

  test('should cancel class with reason', async ({ page }) => {
    await page.goto('http://localhost:3003/classes')

    // Filter to BOOKED classes
    await page.locator('button:has-text("已預約")').click()
    await page.waitForTimeout(500)

    const classCard = page.locator('.bg-white.rounded-lg.shadow').first()
    if (await classCard.isVisible()) {
      await classCard.click()

      // Click cancel button
      await page.locator('button:has-text("取消")').click()

      // Modal should appear
      await expect(page.locator('text=取消課程')).toBeVisible()

      // Fill reason
      await page.locator('textarea').fill('測試取消原因')

      // Confirm
      await page.locator('button[type="submit"]:has-text("確認取消")').click()

      // Should show success message
      await expect(page.locator('.bg-green-500, [class*="success"]')).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe('Quick Attendance from List', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
  })

  test('should mark attendance directly from class list', async ({ page }) => {
    await page.goto('http://localhost:3003/classes')

    // Filter to BOOKED classes
    await page.locator('button:has-text("已預約")').click()
    await page.waitForTimeout(500)

    // Find quick action buttons on class card
    const attendedButton = page.locator('.bg-green-600:has-text("已出席")').first()
    if (await attendedButton.isVisible()) {
      await attendedButton.click()

      // Should show success message
      await expect(page.locator('.bg-green-500, [class*="success"]')).toBeVisible({ timeout: 5000 })
    }
  })
})
