/**
 * Coach App Classes E2E Tests
 *
 * Class list page: date strip and status filters. Attendance / cancel flows
 * need seeded BOOKED classes (the seed has none) and are not covered here.
 */
import { test, expect } from '@playwright/test'
import { loginAsCoach } from '../fixtures/auth'

test.describe('Classes List', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
    await page.goto('/classes')
  })

  test('should display classes page with date strip and status filters', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('課程管理')
    await expect(page.locator('.date-item')).toHaveCount(7)
    await expect(page.locator('.date-item.today')).toHaveCount(1)

    for (const label of ['全部', '待上課', '已完成', '未到', '已取消']) {
      await expect(page.locator('.filter-pill', { hasText: label })).toBeVisible()
    }
  })

  test('should select a date from the date strip', async ({ page }) => {
    const target = page.locator('.date-item:not(.active)').first()
    await target.click()

    await expect(target).toHaveClass(/active/)
    await expect(page.locator('.date-item.active')).toHaveCount(1)
  })

  test('should highlight the clicked status filter', async ({ page }) => {
    const pill = page.locator('.filter-pill', { hasText: '待上課' })
    await pill.click()

    await expect(pill).toHaveClass(/active/)
    await expect(page.locator('.filter-pill', { hasText: '全部' })).not.toHaveClass(/active/)
  })
})
