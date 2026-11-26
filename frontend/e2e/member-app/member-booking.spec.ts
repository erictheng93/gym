/**
 * E2E Tests for Member Booking page
 * Seed data has no class sessions or bookings for member1, so only
 * data-independent behaviour (tabs, empty state) is asserted here.
 */
import { test, expect } from '@playwright/test'
import { loginAsMember } from '../fixtures/auth'

test.describe('Member Booking', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMember(page)
    await page.goto('/bookings')
  })

  test('should display bookings page with both tabs', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: '課程預約' })).toBeVisible()
    await expect(page.getByRole('button', { name: '課程時間表' })).toBeVisible()
    await expect(page.getByRole('button', { name: /我的預約/ })).toBeVisible()
  })

  test('should show empty state in my bookings tab and link back to schedule', async ({ page }) => {
    await page.getByRole('button', { name: /我的預約/ }).click()

    await expect(page.getByText('目前沒有預約的課程')).toBeVisible()

    await page.getByRole('button', { name: '瀏覽課程時間表' }).click()

    await expect(page.getByText('目前沒有預約的課程')).toBeHidden()
  })
})
