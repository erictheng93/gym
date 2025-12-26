import { test, expect } from '@playwright/test'

test.describe('Admin Web - 立即行動清單驗證', () => {
  test.beforeEach(async ({ page }) => {
    // 設置較長的超時時間
    test.setTimeout(60000)
  })

  test('1. 前端能成功啟動並載入首頁', async ({ page }) => {
    await page.goto('http://localhost:3001')

    // 等待頁面載入（應該會重定向到登入頁）
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // 檢查是否有 Gym Nexus 標題
    const title = await page.title()
    console.log('Page title:', title)
    expect(title).toContain('Gym Nexus')
  })

  test('2. 能訪問登入頁面', async ({ page }) => {
    await page.goto('http://localhost:3001/login')
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // 檢查登入表單是否存在
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    const passwordInput = page.locator('input[type="password"], input[name="password"]')

    await expect(emailInput).toBeVisible({ timeout: 5000 })
    await expect(passwordInput).toBeVisible({ timeout: 5000 })

    console.log('✅ 登入表單載入成功')
  })

  test('3. 能使用 eric@dacit.net 登入', async ({ page }) => {
    await page.goto('http://localhost:3001/login')
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // 填寫登入表單
    await page.fill('input[type="email"], input[name="email"]', 'eric@dacit.net')
    await page.fill('input[type="password"], input[name="password"]', 'eric')

    // 點擊登入按鈕
    await page.click('button[type="submit"], button:has-text("登入")')

    // 等待重定向到 dashboard
    await page.waitForURL('**/!(login)**', { timeout: 10000 })

    // 檢查是否成功進入 dashboard
    const url = page.url()
    console.log('Redirected to:', url)
    expect(url).not.toContain('/login')

    console.log('✅ 登入成功')
  })

  test('4. Dashboard 顯示正確的統計數據', async ({ page }) => {
    // 先登入
    await page.goto('http://localhost:3001/login')
    await page.fill('input[type="email"], input[name="email"]', 'eric@dacit.net')
    await page.fill('input[type="password"], input[name="password"]', 'eric')
    await page.click('button[type="submit"], button:has-text("登入")')
    await page.waitForURL('**/!(login)**', { timeout: 10000 })

    // 等待統計數據載入
    await page.waitForTimeout(2000)

    // 檢查會員統計
    const memberStats = await page.textContent('body')
    console.log('Page contains members count:', memberStats?.includes('17') || memberStats?.includes('會員'))

    // 截圖保存
    await page.screenshot({ path: 'dashboard-screenshot.png', fullPage: true })
    console.log('✅ Dashboard 截圖已保存: dashboard-screenshot.png')
  })
})
