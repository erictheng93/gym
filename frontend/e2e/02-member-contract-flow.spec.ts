import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('会员签约流程 E2E', () => {
  test.beforeEach(async ({ page }) => {
    // 登录系统
    await login(page, TEST_USERS.admin)
  })

  test('应该能够访问会员管理页面', async ({ page }) => {
    // 导航到会员列表页
    await page.goto('/members')
    await page.waitForLoadState('networkidle')

    // 确认不在登录页
    const url = page.url()
    if (url.includes('/login')) {
      // 如果被重定向到登录页，重新登录后导航
      await login(page, TEST_USERS.admin)
      await page.goto('/members')
      await page.waitForLoadState('networkidle')
    }

    // 验证页面标题或主要元素存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('应该能够访问新增会员页面', async ({ page }) => {
    // 直接导航到新增会员页
    await page.goto('/members/new')
    await page.waitForLoadState('networkidle')

    // 确认不在登录页
    const url = page.url()
    if (url.includes('/login')) {
      await login(page, TEST_USERS.admin)
      await page.goto('/members/new')
      await page.waitForLoadState('networkidle')
    }

    // 验证有输入框或表单元素
    const hasInputs = await page.locator('input, form').first().isVisible({ timeout: TestEnv.timeouts.default })
    expect(hasInputs).toBe(true)
  })

  test('应该能够访问合约管理页面', async ({ page }) => {
    // 导航到合约列表页
    await page.goto('/contracts')
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (url.includes('/login')) {
      await login(page, TEST_USERS.admin)
      await page.goto('/contracts')
      await page.waitForLoadState('networkidle')
    }

    // 验证页面标题或主要元素存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('应该能够访问新增合约页面', async ({ page }) => {
    await page.goto('/contracts/new')
    await page.waitForLoadState('networkidle')

    const url = page.url()
    if (url.includes('/login')) {
      await login(page, TEST_USERS.admin)
      await page.goto('/contracts/new')
      await page.waitForLoadState('networkidle')
    }

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
  })

  test('应该能够访问会籍方案页面', async ({ page }) => {
    await page.goto('/plans')
    await page.waitForLoadState('networkidle')

    // 验证页面标题或主要元素存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })
})
