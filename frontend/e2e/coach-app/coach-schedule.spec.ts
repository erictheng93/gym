/**
 * Coach App Schedule E2E Tests
 *
 * Weekly schedule display and week navigation.
 */
import { test, expect } from '@playwright/test'
import { loginAsCoach } from '../fixtures/auth'

test.describe('Schedule Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
    await page.goto('/schedule')
  })

  test('should display schedule page with title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('週行事曆')
  })

  test('should display week navigation controls', async ({ page }) => {
    await expect(page.locator('.nav-button')).toHaveCount(2)
    await expect(page.locator('.today-button')).toContainText('今天')
  })

  test('should display 7 day cards', async ({ page }) => {
    await expect(page.locator('.day-card')).toHaveCount(7)
  })

  test('should highlight today card', async ({ page }) => {
    await expect(page.locator('.day-card.is-today')).toHaveCount(1)
  })

  test('should show class count for each day', async ({ page }) => {
    await expect(page.locator('.day-card')).toHaveCount(7)
    await expect(page.locator('.day-card .class-count')).toHaveCount(7)
    await expect(page.locator('.day-card .class-count').first()).toContainText('堂課')
  })

  test('should display week stats', async ({ page }) => {
    const labels = page.locator('.stat-label')
    await expect(labels.getByText('本週課程')).toBeVisible()
    await expect(labels.getByText('已完成')).toBeVisible()
    await expect(labels.getByText('待上課')).toBeVisible()
  })
})

test.describe('Week Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
    await page.goto('/schedule')
  })

  test('should navigate to previous week', async ({ page }) => {
    const weekRange = page.locator('.week-range')
    const initialText = await weekRange.innerText()

    await page.locator('.nav-button').first().click()

    await expect(weekRange).not.toHaveText(initialText)
  })

  test('should navigate to next week', async ({ page }) => {
    const weekRange = page.locator('.week-range')
    const initialText = await weekRange.innerText()

    await page.locator('.nav-button').last().click()

    await expect(weekRange).not.toHaveText(initialText)
  })

  test('should return to current week when clicking today', async ({ page }) => {
    const weekRange = page.locator('.week-range')
    const initialText = await weekRange.innerText()

    await page.locator('.nav-button').first().click()
    await expect(weekRange).not.toHaveText(initialText)

    await page.locator('.today-button').click()
    await expect(weekRange).toHaveText(initialText)
  })
})
