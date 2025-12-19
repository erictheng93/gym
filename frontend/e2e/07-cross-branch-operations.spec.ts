import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('分店管理 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
  })

  test('应该能够访问分店管理页面', async ({ page }) => {
    await page.goto('/branches')
    await page.waitForLoadState('networkidle')

    // 验证页面标题存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('分店管理页面应该正常加载', async ({ page }) => {
    await page.goto('/branches')
    await page.waitForLoadState('networkidle')

    // 页面应该包含某些基本元素
    const hasContent = await page.locator('main, [role="main"], .content, h1, h2').first().isVisible({ timeout: TestEnv.timeouts.default })
    expect(hasContent).toBe(true)
  })

  test('应该能够访问会员入场页面', async ({ page }) => {
    await page.goto('/checkin')
    await page.waitForLoadState('networkidle')

    // 验证页面标题存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('应该能够访问营运报表页面', async ({ page }) => {
    await page.goto('/reports')
    await page.waitForLoadState('networkidle')

    // 验证页面标题存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('首页应该正常加载', async ({ page }) => {
    // 前面 beforeEach 已经登录过了，这里直接验证首页状态
    // 等待页面稳定
    await page.waitForLoadState('networkidle')

    // 验证当前页面有内容 - 可能在首页或被重定向到其他页面
    const hasContent = await page.locator('h1, h2, main, [role="main"]').first().isVisible({ timeout: TestEnv.timeouts.default })
    expect(hasContent).toBe(true)
  })
})
