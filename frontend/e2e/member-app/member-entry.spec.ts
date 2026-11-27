/**
 * E2E Tests for Member Home (QR entry code) page
 */
import { test, expect } from '@playwright/test'
import { loginAsMember, goto } from '../fixtures/auth'

test.describe('Member Entry (QR Code)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMember(page)
    await goto(page, '/')
  })

  test('should display QR code and member code', async ({ page }) => {
    await expect(page.locator('img.qr-image')).toBeVisible()
    await expect(page.getByLabel('會員編號')).toHaveText('MEM001')
  })

  test('should display countdown timer', async ({ page }) => {
    await expect(page.getByRole('timer')).toContainText(/\d+(秒|:\d{2})/)
  })

  test('should have an accessible refresh button', async ({ page }) => {
    await expect(page.getByRole('button', { name: '立即刷新 QR Code' })).toBeVisible()
  })

  test('should display active membership status', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '會籍狀態' })).toBeVisible()
    await expect(page.locator('.list-row').filter({ hasText: '會員狀態' })).toContainText('有效會員')
  })

  test.describe('Quick Actions', () => {
    test('should navigate to bookings', async ({ page }) => {
      await page.getByRole('navigation', { name: '快速操作' }).getByRole('link', { name: '預約課程' }).click()
      await expect(page).toHaveURL(/\/bookings$/)
    })

    test('should navigate to contracts', async ({ page }) => {
      await page.getByRole('navigation', { name: '快速操作' }).getByRole('link', { name: '我的合約' }).click()
      await expect(page).toHaveURL(/\/contracts$/)
    })

    test('should navigate to fitness tracking', async ({ page }) => {
      await page.getByRole('navigation', { name: '快速操作' }).getByRole('link', { name: '健身追蹤' }).click()
      await expect(page).toHaveURL(/\/fitness$/)
    })
  })
})
