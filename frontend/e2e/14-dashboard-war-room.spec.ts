import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'

test.describe('戰情室 Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
    await page.goto('/dashboard/war-room')
    await expect(page.getByRole('heading', { level: 1, name: '戰情室' })).toBeVisible()
  })

  test('顯示四張 KPI 卡片', async ({ page }) => {
    const titles = page.locator('.kpi-section .kpi-title')
    await expect(titles).toHaveText(['今日營收', '活躍會員', '到期警示', '今日入場'])
  })

  test('期間切換按鈕會改變選取狀態', async ({ page }) => {
    const buttons = page.locator('.period-btn')
    await expect(buttons).toHaveText(['今日', '本週', '本月', '今年'])
    await expect(buttons.filter({ hasText: '今日' })).toHaveClass(/active/)

    await buttons.filter({ hasText: '本月' }).click()

    await expect(buttons.filter({ hasText: '本月' })).toHaveClass(/active/)
    await expect(buttons.filter({ hasText: '今日' })).not.toHaveClass(/active/)
  })

  test('顯示合約到期警示區塊', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '合約到期警示' })).toBeVisible()
  })

  test('匯出 KPI 數據 (JSON) 會下載檔案', async ({ page }) => {
    await page.locator('.export-btn').click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'KPI 數據 (JSON)' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/^kpis-\d{4}-\d{2}-\d{2}\.json$/)
  })

  test('HQ 管理員可看到分店選擇器', async ({ page }) => {
    const select = page.locator('.header-controls select.form-select')
    await expect(select).toBeVisible()
    await expect(select.locator('option')).not.toHaveCount(1)
  })
})
