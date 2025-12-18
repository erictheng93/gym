import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('合约管理 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
  })

  test('应该能够访问合约列表页面', async ({ page }) => {
    await page.goto('/contracts')
    await expect(page).toHaveURL('/contracts')

    // 验证页面标题存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('合约列表页面应该正常加载', async ({ page }) => {
    await page.goto('/contracts')

    // 等待页面加载完成
    await page.waitForLoadState('networkidle')

    // 页面应该包含某些基本元素
    const hasContent = await page.locator('main, [role="main"], .content').first().isVisible({ timeout: TestEnv.timeouts.default })
    expect(hasContent).toBe(true)
  })

  test('应该能够访问新增合约页面', async ({ page }) => {
    await page.goto('/contracts/new')
    await expect(page).toHaveURL('/contracts/new')

    // 验证表单存在
    const form = page.locator('form')
    await expect(form).toBeVisible({ timeout: TestEnv.timeouts.default })
  })
})
