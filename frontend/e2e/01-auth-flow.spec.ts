import { test, expect } from '@playwright/test'
import { TEST_USERS } from './fixtures/auth'

test.describe('登录流程 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('应该成功登录并跳转到首页', async ({ page }) => {
    // 填写登录表单
    await page.fill('#email', TEST_USERS.admin.email)
    await page.fill('#password', TEST_USERS.admin.password)

    // 点击登录按钮
    await page.click('button[type="submit"]')

    // 等待导航完成
    await page.waitForURL('/', { timeout: 10000 })

    // 验证已经跳转到首页
    await expect(page).toHaveURL('/')

    // 验证页面包含预期内容（例如导航菜单）
    const navigation = page.locator('nav').or(page.locator('[role="navigation"]'))
    await expect(navigation).toBeVisible({ timeout: 5000 })
  })

  test('应该在空字段时显示错误信息', async ({ page }) => {
    // 不填写任何字段直接提交
    await page.click('button[type="submit"]')

    // 等待错误消息显示
    const errorBanner = page.locator('.error-banner')
    await expect(errorBanner).toBeVisible({ timeout: 3000 })

    // 验证错误消息内容
    await expect(errorBanner).toContainText(/必填|required/i)

    // 确保没有跳转
    await expect(page).toHaveURL('/login')
  })

  test('应该在错误的凭证时显示错误信息', async ({ page }) => {
    // 填写错误的凭证
    await page.fill('#email', 'wrong@example.com')
    await page.fill('#password', 'wrongpassword')

    // 点击登录按钮
    await page.click('button[type="submit"]')

    // 等待错误消息显示
    const errorBanner = page.locator('.error-banner')
    await expect(errorBanner).toBeVisible({ timeout: 5000 })

    // 验证错误消息存在
    await expect(errorBanner).toContainText(/错误|失败|error|fail/i)

    // 确保没有跳转
    await expect(page).toHaveURL('/login')

    // 验证登录卡片有shake动画
    const loginCard = page.locator('.login-card')
    await expect(loginCard).toHaveClass(/shake/)
  })

  test('应该在邮箱格式无效时进行前端验证', async ({ page }) => {
    // 填写无效的邮箱
    await page.fill('#email', 'invalid-email')
    await page.fill('#password', 'password123')

    // HTML5验证应该阻止表单提交
    const emailInput = page.locator('#email')
    const validationMessage = await emailInput.evaluate((el: HTMLInputElement) => el.validationMessage)

    // 验证浏览器显示验证消息
    expect(validationMessage).toBeTruthy()
  })

  test('应该成功登出并返回登录页', async ({ page }) => {
    // 先登录
    await page.fill('#email', TEST_USERS.admin.email)
    await page.fill('#password', TEST_USERS.admin.password)
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 10000 })

    // 查找并点击登出按钮
    // 注意：需要根据实际的UI结构调整选择器
    const logoutButton = page.locator('text=登出').or(
      page.locator('text=Logout').or(
        page.locator('button:has-text("登出")').or(
          page.locator('[aria-label*="登出"]')
        )
      )
    )

    // 如果登出按钮在菜单中，先打开菜单
    const userMenu = page.locator('[aria-label*="用户"]').or(
      page.locator('[aria-label*="User"]').or(
        page.locator('.user-menu')
      )
    )

    try {
      await userMenu.click({ timeout: 3000 })
    } catch {
      // 如果没有用户菜单，继续执行
    }

    await logoutButton.click({ timeout: 5000 })

    // 等待跳转到登录页
    await page.waitForURL('/login', { timeout: 10000 })

    // 验证已经回到登录页
    await expect(page).toHaveURL('/login')

    // 验证登录表单可见
    const emailInput = page.locator('#email')
    await expect(emailInput).toBeVisible()
  })

  test('应该在加载时显示加载状态', async ({ page }) => {
    // 填写登录表单
    await page.fill('#email', TEST_USERS.admin.email)
    await page.fill('#password', TEST_USERS.admin.password)

    // 点击登录按钮
    const submitButton = page.locator('button[type="submit"]')
    await submitButton.click()

    // 验证按钮显示加载状态
    await expect(submitButton).toBeDisabled()

    // 验证加载spinner出现
    const spinner = page.locator('.loading-spinner')
    await expect(spinner).toBeVisible({ timeout: 1000 })
  })

  test('应该在已登录时自动跳转到首页', async ({ page, context }) => {
    // 先登录获取token
    await page.fill('#email', TEST_USERS.admin.email)
    await page.fill('#password', TEST_USERS.admin.password)
    await page.click('button[type="submit"]')
    await page.waitForURL('/', { timeout: 10000 })

    // 打开新标签页并访问登录页
    const newPage = await context.newPage()
    await newPage.goto('/login')

    // 应该自动跳转到首页
    await newPage.waitForURL('/', { timeout: 5000 })
    await expect(newPage).toHaveURL('/')

    await newPage.close()
  })
})
