import { test, expect } from '@playwright/test'
import { login, logout, TEST_USERS } from './fixtures/auth'
import { TestEnv } from './config/test-env'

// 生成唯一的測試數據
function generateTestMember() {
  const timestamp = Date.now()
  return {
    fullName: `測試會員_${timestamp}`,
    phone: `09${String(timestamp).slice(-8)}`,
    email: `test_${timestamp}@example.com`,
  }
}

test.describe('会员签约流程 E2E', () => {
  test.beforeEach(async ({ page }) => {
    // 登录系统
    await login(page, TEST_USERS.admin)
  })

  test.afterEach(async ({ page }) => {
    // 嘗試登出，忽略錯誤
    try {
      await logout(page)
    } catch {
      // 忽略登出錯誤
    }
  })

  test.describe('會員管理', () => {
    test('应该能够访问会员管理页面', async ({ page }) => {
      // 导航到会员列表页
      await page.goto('/members')
      await page.waitForLoadState('networkidle')

      // 确认不在登录页
      await expect(page).not.toHaveURL('/login')

      // 验证页面标题或主要元素存在
      const pageTitle = page.locator('h1, h2').first()
      await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('应该能够访问新增会员页面', async ({ page }) => {
      // 直接导航到新增会员页
      await page.goto('/members/new')
      await page.waitForLoadState('networkidle')

      // 确认不在登录页
      await expect(page).not.toHaveURL('/login')

      // 验证有输入框或表单元素
      const hasInputs = await page.locator('input, form').first().isVisible({ timeout: TestEnv.timeouts.default })
      expect(hasInputs).toBe(true)
    })

    test('應該能夠新增會員', async ({ page }) => {
      const testMember = generateTestMember()

      // 導航到新增會員頁
      await page.goto('/members/new')
      await page.waitForLoadState('networkidle')

      // 填寫會員表單
      const fullNameInput = page.locator('input[name="full_name"], #full_name, input[placeholder*="姓名"]').first()
      if (await fullNameInput.isVisible()) {
        await fullNameInput.fill(testMember.fullName)
      }

      const phoneInput = page.locator('input[name="phone"], #phone, input[placeholder*="電話"]').first()
      if (await phoneInput.isVisible()) {
        await phoneInput.fill(testMember.phone)
      }

      const emailInput = page.locator('input[name="email"], #email, input[type="email"]').first()
      if (await emailInput.isVisible()) {
        await emailInput.fill(testMember.email)
      }

      // 提交表單
      const submitButton = page.locator('button[type="submit"]').first()
      await submitButton.click()

      // 等待 API 響應
      await page.waitForLoadState('networkidle')

      // 驗證成功 - 應該有成功提示或重定向到會員列表/詳情頁
      const successIndicator = page.locator('.toast-success, [class*="success"], [role="alert"]')
      const redirected = !page.url().includes('/members/new')

      // 成功條件：看到成功提示 OR 被重定向離開新增頁面
      expect(await successIndicator.isVisible() || redirected).toBe(true)
    })

    test('新增會員表單應該驗證必填欄位', async ({ page }) => {
      await page.goto('/members/new')
      await page.waitForLoadState('networkidle')

      // 不填寫任何內容直接提交
      const submitButton = page.locator('button[type="submit"]').first()
      await submitButton.click()

      // 應該顯示驗證錯誤或表單保持在當前頁面
      await page.waitForTimeout(500)

      // 驗證：仍在新增頁面（表單驗證阻止了提交）
      expect(page.url()).toContain('/members/new')
    })

    test('應該能夠搜尋會員', async ({ page }) => {
      await page.goto('/members')
      await page.waitForLoadState('networkidle')

      // 找到搜尋輸入框
      const searchInput = page.locator('input[type="search"], input[placeholder*="搜尋"], input[placeholder*="Search"]').first()

      if (await searchInput.isVisible()) {
        // 輸入搜尋關鍵字
        await searchInput.fill('測試')
        await searchInput.press('Enter')

        // 等待搜尋結果
        await page.waitForLoadState('networkidle')

        // 頁面應該仍然正常顯示
        await expect(page).not.toHaveURL('/login')
      }
    })
  })

  test.describe('合約管理', () => {
    test('应该能够访问合约管理页面', async ({ page }) => {
      // 导航到合约列表页
      await page.goto('/contracts')
      await page.waitForLoadState('networkidle')

      // 确认不在登录页
      await expect(page).not.toHaveURL('/login')

      // 验证页面标题或主要元素存在
      const pageTitle = page.locator('h1, h2').first()
      await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('应该能够访问新增合约页面', async ({ page }) => {
      await page.goto('/contracts/new')
      await page.waitForLoadState('networkidle')

      // 确认不在登录页
      await expect(page).not.toHaveURL('/login')

      // 验证表单存在
      const form = page.locator('form')
      await expect(form).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('合约表单应该有会员选择下拉框', async ({ page }) => {
      await page.goto('/contracts/new')
      await page.waitForLoadState('networkidle')

      // 表单应该有某种选择器
      const hasForm = await page.locator('form').isVisible({ timeout: TestEnv.timeouts.default })
      expect(hasForm).toBe(true)

      // 應該有會員選擇相關的元素
      const memberSelector = page.locator('[class*="member"], [data-testid*="member"], select, [role="combobox"]').first()
      await expect(memberSelector).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('新增合約應該需要選擇會員和方案', async ({ page }) => {
      await page.goto('/contracts/new')
      await page.waitForLoadState('networkidle')

      // 嘗試不選擇會員就提交
      const submitButton = page.locator('button[type="submit"], button').filter({ hasText: /下一步|確認|送出|Submit/i }).first()

      if (await submitButton.isVisible()) {
        await submitButton.click()
        await page.waitForTimeout(500)

        // 應該仍在新增頁面或顯示錯誤
        const stillOnPage = page.url().includes('/contracts/new')
        const hasError = await page.locator('.error, [class*="error"], [role="alert"]').first().isVisible()

        expect(stillOnPage || hasError).toBe(true)
      }
    })
  })

  test.describe('會籍方案', () => {
    test('应该能够访问会籍方案页面', async ({ page }) => {
      await page.goto('/plans')
      await page.waitForLoadState('networkidle')

      // 确认不在登录页
      await expect(page).not.toHaveURL('/login')

      // 验证页面标题或主要元素存在
      const pageTitle = page.locator('h1, h2').first()
      await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('方案頁面應該顯示方案列表或空狀態', async ({ page }) => {
      await page.goto('/plans')
      await page.waitForLoadState('networkidle')

      // 應該有方案列表或空狀態提示
      const planList = page.locator('table, [class*="plan"], [class*="card"], [class*="list"]').first()
      const emptyState = page.locator('[class*="empty"], [class*="no-data"]').first()

      const hasList = await planList.isVisible()
      const hasEmpty = await emptyState.isVisible()

      // 應該至少有一個可見
      expect(hasList || hasEmpty).toBe(true)
    })
  })
})
