import { test, expect } from '@playwright/test'
import { login, goto, TEST_USERS } from './fixtures/auth'
import { TestEnv } from './config/test-env'

/**
 * Front-desk member check-in: search → select → preview contract.
 * Read-only on purpose: it stops before 確認入場 so reruns do not depend on
 * whether the member already checked in today.
 * Seed data: 趙小明 (MEM001) has an ACTIVE contract; which CON number it gets
 * depends on seed insert order, so only the format is asserted.
 */
test.describe('前台會員入場簽到流程', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
    await goto(page, '/checkin')
  })

  test('顯示搜尋欄與今日入場紀錄', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: '會員入場' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: /搜尋會員/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: '今日入場紀錄' })).toBeVisible()
  })

  test('搜尋會員後預覽有效合約並可入場', async ({ page }) => {
    await page.getByRole('textbox', { name: /搜尋會員/ }).fill('趙小明')

    const result = page.getByRole('button', { name: /趙小明/ }).first()
    await expect(result).toBeVisible({ timeout: TestEnv.timeouts.default })
    await result.click()

    const preview = page.locator('.selected-preview')
    await expect(preview.getByRole('heading', { name: '趙小明' })).toBeVisible()
    await expect(preview.getByText('MEM001')).toBeVisible()
    await expect(preview.locator('.contract-info')).toContainText(/CON\d{6}/)
    await expect(preview.getByRole('button', { name: /確認入場|今日已入場/ })).toBeVisible()
  })
})
