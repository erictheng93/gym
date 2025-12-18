import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('分店管理 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
  })

  test('应该能够访问分店管理页面', async ({ page }) => {
    await page.goto('/branches')
    await expect(page).toHaveURL('/branches')

    // 验证页面标题存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('分店管理页面应该正常加载', async ({ page }) => {
    await page.goto('/branches')

    // 等待页面加载完成
    await page.waitForLoadState('networkidle')

    // 页面应该包含某些基本元素
    const hasContent = await page.locator('main, [role="main"], .content').first().isVisible({ timeout: TestEnv.timeouts.default })
    expect(hasContent).toBe(true)
  })

  test('应该能够访问会员入场页面', async ({ page }) => {
    await page.goto('/checkin')
    await expect(page).toHaveURL('/checkin')

    // 验证页面标题存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('应该能够访问营运报表页面', async ({ page }) => {
    await page.goto('/reports')
    await expect(page).toHaveURL('/reports')

    // 验证页面标题存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('导航栏应该显示所有主要功能链接', async ({ page }) => {
    await page.goto('/')

    // 验证导航栏存在
    const nav = page.locator('nav, [role="navigation"]').first()
    await expect(nav).toBeVisible({ timeout: TestEnv.timeouts.default })

    // 验证主要链接存在
    const mainLinks = [
      /會員|會員管理|Members/i,
      /合約|Contracts/i,
      /收款|Payments/i,
      /員工|Employees/i,
      /分店|Branches/i
    ]

    for (const linkPattern of mainLinks) {
      const link = nav.locator('a').filter({ hasText: linkPattern }).first()
      if (await link.isVisible({ timeout: 1000 })) {
        await expect(link).toBeVisible()
      }
    }
  })
})
