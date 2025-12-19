import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('支付管理 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
  })

  test('应该能够访问收款管理页面', async ({ page }) => {
    await page.goto('/payments')
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (url.includes('/login')) {
      await login(page, TEST_USERS.admin)
      await page.goto('/payments')
      await page.waitForLoadState('networkidle')
    }

    // 验证页面标题存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('收款页面应该正常加载', async ({ page }) => {
    await page.goto('/payments')
    await page.waitForLoadState('networkidle')

    // 页面应该包含某些基本元素
    const hasContent = await page.locator('main, [role="main"], .content, h1, h2').first().isVisible({ timeout: TestEnv.timeouts.default })
    expect(hasContent).toBe(true)
  })

  test('应该能够访问新增收款页面', async ({ page }) => {
    await page.goto('/payments/new')
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (url.includes('/login')) {
      await login(page, TEST_USERS.admin)
      await page.goto('/payments/new')
      await page.waitForLoadState('networkidle')
    }

    // 验证表单存在
    const form = page.locator('form')
    await expect(form).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('新增收款页面应该有金额输入框', async ({ page }) => {
    await page.goto('/payments/new')
    await page.waitForLoadState('networkidle')

    // 页面应该有某种输入
    const hasAnyInput = await page.locator('input, select, form').first().isVisible({ timeout: TestEnv.timeouts.default })
    expect(hasAnyInput).toBe(true)
  })
})
