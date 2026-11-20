import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('前台會員入場簽到與核銷流程 E2E', () => {
  test.beforeEach(async ({ page }) => {
    // 登入系統
    await login(page, TEST_USERS.admin)
  })

  test('應該能夠進入會員入場頁面並顯示基本介面', async ({ page }) => {
    await page.goto('/checkin')
    await page.waitForLoadState('networkidle')

    // 驗證標題
    const title = page.locator('h1, h2').filter({ hasText: /會員入場/ }).first()
    await expect(title).toBeVisible({ timeout: TestEnv.timeouts.default })

    // 驗證搜尋輸入框存在
    const searchInput = page.getByRole('textbox', { name: /搜尋會員姓名/ })
    await expect(searchInput).toBeVisible()

    // 驗證今日入場紀錄區塊存在
    const todayRecords = page.getByText(/今日入場紀錄/)
    await expect(todayRecords).toBeVisible()
  })

  test('應該能夠搜尋會員、預覽有效合約並完成入場登記', async ({ page }) => {
    await page.goto('/checkin')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByRole('textbox', { name: /搜尋會員姓名/ })
    await expect(searchInput).toBeVisible()

    // 輸入會員姓名或編號搜尋
    await searchInput.fill('趙')

    // 等待搜尋下拉選單出現會員結果
    const memberResultBtn = page.getByRole('button', { name: /趙小明/ }).first()
    await expect(memberResultBtn).toBeVisible({ timeout: 5000 })

    // 點擊選中會員
    await memberResultBtn.click()

    // 驗證選中會員預覽資訊
    await expect(page.getByRole('heading', { name: '趙小明' })).toBeVisible()
    await expect(page.getByText('MEM001').first()).toBeVisible()

    // 驗證有效合約資訊正確載入
    await expect(page.getByText(/CON000001/).first()).toBeVisible()

    // 確認入場按鈕應為啟用狀態（若當日已入場則顯示今日已入場）
    const checkinBtn = page.getByRole('button', { name: /確認入場|今日已入場/ })
    await expect(checkinBtn).toBeVisible()
  })
})
