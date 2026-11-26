import { test, expect } from '@playwright/test'
import { login, TEST_USERS, goto } from './fixtures/auth'

test.describe('BI 報表', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
  })

  test('營運報表顯示營收趨勢、熱門方案與匯出區塊', async ({ page }) => {
    await goto(page, '/reports')

    await expect(page.getByRole('heading', { level: 1, name: '營運報表' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '營收趨勢' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '熱門方案' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '匯出報表' })).toBeVisible()
  })

  test('營運報表期間切換會改變選取狀態', async ({ page }) => {
    await goto(page, '/reports')
    const tabs = page.locator('.period-tabs button')
    await expect(tabs.first()).toBeVisible()

    const last = tabs.last()
    await last.click()
    await expect(last).toHaveClass(/active/)
    await expect(tabs.first()).not.toHaveClass(/active/)
  })

  test('會員分析顯示統計卡與分佈圖', async ({ page }) => {
    await goto(page, '/admin/member-analytics')

    await expect(page.getByRole('heading', { level: 1, name: '會員分析' })).toBeVisible()
    for (const name of ['總會員數', '活躍會員', '流失率', '年齡分佈', '性別分佈']) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
    }
  })

  test('系統分析：管理員可看到 API 使用統計', async ({ page }) => {
    await goto(page, '/admin/analytics')

    await expect(page.getByRole('heading', { level: 1, name: '系統分析' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'API 使用統計' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '權限不足' })).toHaveCount(0)
  })

  test('審計日誌頁面可載入', async ({ page }) => {
    await goto(page, '/admin/audit-logs')

    await expect(page.getByRole('heading', { level: 1, name: '审计日志' })).toBeVisible()
  })
})

test.describe('系統分析權限', () => {
  test('非管理員/店長（教練帳號）看到權限不足', async ({ page }) => {
    await login(page, TEST_USERS.coach)
    await goto(page, '/admin/analytics')

    await expect(page.getByRole('heading', { name: '權限不足' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'API 使用統計' })).toHaveCount(0)
  })
})
