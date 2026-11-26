/**
 * E2E Tests for Member Notification Settings
 */
import { test, expect } from '@playwright/test'
import { loginAsMember, goto } from '../fixtures/auth'

test.describe('Member Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMember(page)
    await goto(page, '/profile/notifications')
  })

  test('should display settings tab with channels and notification types', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: '通知設定' })).toBeVisible()
    await expect(page.getByRole('button', { name: '設定', exact: true })).toHaveClass(/active/)

    await expect(page.getByRole('heading', { name: '通知管道' })).toBeVisible()
    for (const channel of ['LINE', '推播通知', 'Email', '簡訊']) {
      await expect(page.getByRole('heading', { name: channel, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: '通知類型' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '勿擾時段' })).toBeVisible()
  })

  test('should show empty state in history tab', async ({ page }) => {
    await page.getByRole('button', { name: '歷史紀錄' }).click()

    await expect(page.getByText('尚無通知紀錄')).toBeVisible()
  })
})
