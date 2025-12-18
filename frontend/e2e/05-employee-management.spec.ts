import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('員工管理 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
  })

  test('应该能够访问员工管理页面', async ({ page }) => {
    await page.goto('/employees')
    await expect(page).toHaveURL('/employees')

    // 验证页面标题存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('员工列表页面应该正常加载', async ({ page }) => {
    await page.goto('/employees')

    // 等待页面加载完成
    await page.waitForLoadState('networkidle')

    // 页面应该包含某些基本元素
    const hasContent = await page.locator('main, [role="main"], .content').first().isVisible({ timeout: TestEnv.timeouts.default })
    expect(hasContent).toBe(true)
  })

  test('应该能够访问新增员工页面', async ({ page }) => {
    await page.goto('/employees/new')
    await expect(page).toHaveURL('/employees/new')

    // 验证表单存在
    const form = page.locator('form')
    await expect(form).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('新增员工表单应该有必要字段', async ({ page }) => {
    await page.goto('/employees/new')

    // 等待表单加载
    await page.waitForLoadState('networkidle')

    // 应该有某种输入字段
    const hasInputs = await page.locator('input, select').first().isVisible({ timeout: TestEnv.timeouts.default })
    expect(hasInputs).toBe(true)
  })
})
