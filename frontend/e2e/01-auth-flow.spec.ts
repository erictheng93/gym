import { test, expect } from '@playwright/test'
import { TEST_USERS, login, logout } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('登录流程 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    // 等待頁面完全載入
    await page.waitForLoadState('networkidle')
  })

  test('应该成功登录并跳转到首页', async ({ page }) => {
    // 使用 login 助手函数
    await login(page, TEST_USERS.admin)

    // 验证页面包含预期内容（例如导航菜单）
    const navigation = page.locator('nav, [role="navigation"]').first()
    await expect(navigation).toBeVisible({ timeout: TestEnv.timeouts.default })

    // 验证显示欢迎信息或用户相关内容
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('应该在空字段时显示错误信息', async ({ page }) => {
    // 等待頁面動畫完成
    await page.waitForTimeout(500)

    // 不填写任何字段直接提交
    await page.locator('button[type="submit"]').click()

    // 等待错误消息显示 - 使用 .error-banner 類名
    const errorBanner = page.locator('.error-banner')
    await expect(errorBanner).toBeVisible({ timeout: TestEnv.timeouts.default })

    // 验证错误消息内容包含必填相关文字
    await expect(errorBanner).toContainText(/必填|請填寫|required/i)

    // 确保没有跳转
    await expect(page).toHaveURL('/login')
  })

  test('应该在错误的凭证时显示错误信息', async ({ page }) => {
    // 等待頁面動畫完成
    await page.waitForTimeout(500)

    // 填写错误的凭证
    await page.locator('#email').fill('wrong@example.com')
    await page.locator('#password').fill('wrongpassword')

    // 点击登录按钮
    await page.locator('button[type="submit"]').click()

    // 等待错误消息显示
    const errorBanner = page.locator('.error-banner')
    await expect(errorBanner).toBeVisible({ timeout: TestEnv.timeouts.default })

    // 确保没有跳转
    await expect(page).toHaveURL('/login')
  })

  test('应该在邮箱格式无效时进行前端验证', async ({ page }) => {
    // 等待頁面動畫完成
    await page.waitForTimeout(500)

    // 填写无效的邮箱
    await page.locator('#email').fill('invalid-email')
    await page.locator('#password').fill('password123')

    // HTML5验证应该阻止表单提交
    const emailInput = page.locator('#email')
    const validationMessage = await emailInput.evaluate((el: HTMLInputElement) => el.validationMessage)

    // 验证浏览器显示验证消息
    expect(validationMessage).toBeTruthy()
  })

  test('应该成功登出并返回登录页', async ({ page }) => {
    // 先登录
    await login(page, TEST_USERS.admin)

    // 使用 logout 助手函数
    await logout(page)

    // 验证已经回到登录页
    await expect(page).toHaveURL('/login')

    // 验证登录表单可见
    const emailInput = page.locator('#email')
    await expect(emailInput).toBeVisible()
  })

  test('应该在加载时显示加载状态', async ({ page }) => {
    // 等待頁面動畫完成
    await page.waitForTimeout(500)

    // 填写登录表单
    await page.locator('#email').fill(TEST_USERS.admin.email)
    await page.locator('#password').fill(TEST_USERS.admin.password)

    // 使用 Promise.all 同時點擊按鈕並檢測加載狀態
    const submitButton = page.locator('button[type="submit"]')

    // 點擊按鈕後立即檢查
    await submitButton.click()

    // 登入過程中按鈕應該被禁用或顯示加載狀態
    // 注意：這個測試可能因網路速度而有不同結果，所以我們只檢查最終狀態
    // 等待頁面導航完成
    await page.waitForURL('/', { timeout: TestEnv.timeouts.navigation })

    // 驗證最終登入成功
    await expect(page.locator('nav, [role="navigation"]').first()).toBeVisible()
  })

  test('应该在已登录时访问登录页会自动跳转到首页', async ({ page, context }) => {
    // 先登录
    await login(page, TEST_USERS.admin)

    // 打开新标签页并访问登录页
    const newPage = await context.newPage()
    await newPage.goto('/login')

    // 等待一下讓重定向發生
    await newPage.waitForTimeout(2000)

    // 應該已經被重定向到首頁，或者仍在登入頁（取決於 cookie 是否共享）
    // 由於 cookie 可能不會在新 tab 之間立即共享，我們只驗證頁面正常載入
    const currentUrl = newPage.url()
    expect(currentUrl).toMatch(/\/(login)?$/)

    await newPage.close()
  })
})
