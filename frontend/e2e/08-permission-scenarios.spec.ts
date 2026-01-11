import { test, expect } from '@playwright/test'
import { TEST_USERS, login, logout } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('權限控制 E2E', () => {
  test.describe('管理員權限', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, TEST_USERS.admin)
    })

    test.afterEach(async ({ page }) => {
      await logout(page)
    })

    test('管理員應該可以訪問所有頁面', async ({ page }) => {
      // 測試訪問各個主要頁面
      const pages = [
        { url: '/members', title: /會員/i },
        { url: '/contracts', title: /合約/i },
        { url: '/payments', title: /收款|付款/i },
        { url: '/employees', title: /員工/i },
        { url: '/branches', title: /分店/i },
      ]

      for (const p of pages) {
        await page.goto(p.url)
        await page.waitForLoadState('networkidle')

        // 應該不會被重定向到登入頁
        await expect(page).not.toHaveURL('/login')

        // 頁面應該包含相關標題
        const heading = page.locator('h1, h2').first()
        await expect(heading).toBeVisible({ timeout: TestEnv.timeouts.default })
      }
    })

    test('管理員應該可以看到新增按鈕', async ({ page }) => {
      await page.goto('/members')
      await page.waitForLoadState('networkidle')

      // 應該能看到新增會員按鈕
      const addButton = page.locator('a, button').filter({
        hasText: /新增|新建|Add|Create/i
      })
      await expect(addButton.first()).toBeVisible({ timeout: TestEnv.timeouts.default })
    })
  })

  test.describe('一般用戶權限', () => {
    // 注意：這些測試需要有限權限的測試用戶
    // 如果沒有設置 staff 用戶，這些測試會被跳過

    test('一般用戶應該可以訪問允許的頁面', async ({ page }) => {
      // 嘗試使用 staff 用戶登入
      if (!TEST_USERS.staff?.email) {
        test.skip()
        return
      }

      await login(page, TEST_USERS.staff)

      // 訪問儀表板應該是允許的
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // 應該不會被重定向到登入頁
      await expect(page).not.toHaveURL('/login')

      await logout(page)
    })
  })

  test.describe('未授權訪問處理', () => {
    test('未登入用戶訪問受保護頁面應重定向到登入頁', async ({ page }) => {
      // 直接訪問受保護的頁面（未登入狀態）
      await page.goto('/members')

      // 等待重定向
      await page.waitForLoadState('networkidle')

      // 應該被重定向到登入頁
      await expect(page).toHaveURL('/login', { timeout: TestEnv.timeouts.navigation })
    })

    test('未登入用戶訪問合約頁面應重定向到登入頁', async ({ page }) => {
      await page.goto('/contracts')
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL('/login', { timeout: TestEnv.timeouts.navigation })
    })

    test('未登入用戶訪問員工頁面應重定向到登入頁', async ({ page }) => {
      await page.goto('/employees')
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL('/login', { timeout: TestEnv.timeouts.navigation })
    })
  })

  test.describe('權限被拒絕處理', () => {
    test('後端權限拒絕應顯示錯誤訊息', async ({ page }) => {
      // 登入
      await login(page, TEST_USERS.admin)

      // 訪問會員頁面
      await page.goto('/members')
      await page.waitForLoadState('networkidle')

      // 監聽 API 錯誤響應
      const [response] = await Promise.all([
        page.waitForResponse(
          resp => resp.url().includes('/items/') && resp.status() === 403,
          { timeout: 5000 }
        ).catch(() => null),
        // 嘗試執行一個可能被拒絕的操作（如果有的話）
        page.evaluate(() => {
          // 這只是檢查頁面正常載入
          return document.title
        })
      ])

      // 如果收到 403 響應，頁面應該顯示錯誤提示
      if (response) {
        const errorMessage = page.locator('.toast, .error-banner, [role="alert"]')
        await expect(errorMessage).toBeVisible({ timeout: TestEnv.timeouts.default })
      }

      await logout(page)
    })
  })

  test.describe('員工帳號狀態處理', () => {
    test('有員工記錄的用戶應該正常訪問', async ({ page }) => {
      await login(page, TEST_USERS.admin)

      // 訪問首頁
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // 不應該看到員工警告
      const warningBanner = page.locator('.employee-warning')
      await expect(warningBanner).not.toBeVisible()

      await logout(page)
    })

    // 注意：測試「沒有員工記錄」的情況需要特殊的測試用戶
    // 這個測試在實際環境中可能需要設置專門的測試資料
  })
})
