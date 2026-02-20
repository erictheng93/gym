/**
 * Coach App Schedule E2E Tests
 *
 * Tests weekly schedule display, navigation, and interactions
 */
import { test, expect } from '@playwright/test'

async function loginAsCoach(page: any) {
  await page.goto('http://localhost:3003/login')
  await page.locator('input[type="text"]').fill('test-coach@example.com')
  await page.locator('input[type="password"]').fill('testpassword123')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/$/)
}

test.describe('Schedule Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
    await page.goto('http://localhost:3003/schedule')
  })

  test('should display schedule page with title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('週行事曆')
  })

  test('should display week navigation controls', async ({ page }) => {
    await expect(page.locator('.nav-button').first()).toBeVisible()
    await expect(page.locator('.nav-button').last()).toBeVisible()
  })

  test('should display today button', async ({ page }) => {
    await expect(page.locator('.today-button')).toBeVisible()
    await expect(page.locator('.today-button')).toContainText('今天')
  })

  test('should display 7 day cards', async ({ page }) => {
    const dayCards = page.locator('.day-card')
    await expect(dayCards).toHaveCount(7)
  })

  test('should highlight today card', async ({ page }) => {
    const todayCard = page.locator('.day-card.is-today')
    await expect(todayCard).toBeVisible()
  })

  test('should show class count for each day', async ({ page }) => {
    const dayCards = page.locator('.day-card')
    const count = await dayCards.count()

    for (let i = 0; i < count; i++) {
      const classCount = dayCards.nth(i).locator('.class-count')
      await expect(classCount).toBeVisible()
    }
  })

  test('should display week stats', async ({ page }) => {
    await expect(page.locator('text=本週課程')).toBeVisible()
    await expect(page.locator('text=已完成')).toBeVisible()
    await expect(page.locator('text=待上課')).toBeVisible()
  })
})

test.describe('Week Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
    await page.goto('http://localhost:3003/schedule')
  })

  test('should navigate to previous week', async ({ page }) => {
    const weekRange = page.locator('.week-range')
    const initialText = await weekRange.textContent()

    // Click previous week button (first nav-button)
    await page.locator('.nav-button').first().click()
    await page.waitForTimeout(500)

    const updatedText = await weekRange.textContent()
    expect(updatedText).not.toBe(initialText)
  })

  test('should navigate to next week', async ({ page }) => {
    const weekRange = page.locator('.week-range')
    const initialText = await weekRange.textContent()

    // Click next week button (last nav-button)
    await page.locator('.nav-button').last().click()
    await page.waitForTimeout(500)

    const updatedText = await weekRange.textContent()
    expect(updatedText).not.toBe(initialText)
  })

  test('should return to current week when clicking today', async ({ page }) => {
    const weekRange = page.locator('.week-range')
    const initialText = await weekRange.textContent()

    // Navigate away from current week
    await page.locator('.nav-button').first().click()
    await page.waitForTimeout(500)

    const navigatedText = await weekRange.textContent()
    expect(navigatedText).not.toBe(initialText)

    // Click "今天" to return
    await page.locator('.today-button').click()
    await page.waitForTimeout(500)

    const returnedText = await weekRange.textContent()
    expect(returnedText).toBe(initialText)
  })
})

test.describe('Schedule Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
    await page.goto('http://localhost:3003/schedule')
  })

  test('should navigate to class detail when clicking a schedule item', async ({ page }) => {
    const scheduleItem = page.locator('.schedule-item').first()

    if (await scheduleItem.isVisible()) {
      await scheduleItem.click()
      await expect(page).toHaveURL(/\/classes\//, { timeout: 5000 })
    }
  })
})

test.describe('Auth Guard', () => {
  test('should redirect to login when accessing schedule without auth', async ({ page }) => {
    await page.goto('http://localhost:3003/schedule')
    await expect(page).toHaveURL(/\/login/)
  })
})
