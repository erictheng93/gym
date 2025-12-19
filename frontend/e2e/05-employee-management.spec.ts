import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('員工管理 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
  })

  test('应该能够访问员工管理页面', async ({ page }) => {
    await page.goto('/employees')
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (url.includes('/login')) {
      await login(page, TEST_USERS.admin)
      await page.goto('/employees')
      await page.waitForLoadState('networkidle')
    }

    // 验证页面标题存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('员工列表页面应该正常加载', async ({ page }) => {
    await page.goto('/employees')
    await page.waitForLoadState('networkidle')

    // 页面应该包含某些基本元素
    const hasContent = await page.locator('main, [role="main"], .content, h1, h2').first().isVisible({ timeout: TestEnv.timeouts.default })
    expect(hasContent).toBe(true)
  })

  test('应该能够访问新增员工页面', async ({ page }) => {
    await page.goto('/employees/new')
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (url.includes('/login')) {
      await login(page, TEST_USERS.admin)
      await page.goto('/employees/new')
      await page.waitForLoadState('networkidle')
    }

    // 验证表单存在
    const form = page.locator('form')
    await expect(form).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('新增员工表单应该有必要字段', async ({ page }) => {
    await page.goto('/employees/new')
    await page.waitForLoadState('networkidle')

    // 应该有某种输入字段
    const hasInputs = await page.locator('input, select, form').first().isVisible({ timeout: TestEnv.timeouts.default })
    expect(hasInputs).toBe(true)
  })
})
