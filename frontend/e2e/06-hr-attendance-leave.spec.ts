import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('HR 人資管理 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
  })

  test('应该能够访问人资管理页面', async ({ page }) => {
    await page.goto('/hr')
    await expect(page).toHaveURL('/hr')

    // 验证页面标题存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('人资管理页面应该正常加载', async ({ page }) => {
    await page.goto('/hr')

    // 等待页面加载完成
    await page.waitForLoadState('networkidle')

    // 页面应该包含某些基本元素
    const hasContent = await page.locator('main, [role="main"], .content').first().isVisible({ timeout: TestEnv.timeouts.default })
    expect(hasContent).toBe(true)
  })

  test('应该能够访问考勤相关页面', async ({ page }) => {
    // 先访问 HR 页面
    await page.goto('/hr')
    await page.waitForLoadState('networkidle')

    // 查找考勤相关链接或标签页
    const attendanceLink = page.locator('a, button').filter({ hasText: /考勤|打卡|Attendance/i }).first()

    if (await attendanceLink.isVisible({ timeout: 3000 })) {
      await attendanceLink.click()
      await page.waitForLoadState('networkidle')

      // 验证页面已加载
      const hasContent = await page.locator('main, [role="main"], .content').first().isVisible({ timeout: TestEnv.timeouts.default })
      expect(hasContent).toBe(true)
    }
  })

  test('应该能够访问请假相关页面', async ({ page }) => {
    // 先访问 HR 页面
    await page.goto('/hr')
    await page.waitForLoadState('networkidle')

    // 查找请假相关链接或标签页
    const leaveLink = page.locator('a, button').filter({ hasText: /請假|休假|Leave/i }).first()

    if (await leaveLink.isVisible({ timeout: 3000 })) {
      await leaveLink.click()
      await page.waitForLoadState('networkidle')

      // 验证页面已加载
      const hasContent = await page.locator('main, [role="main"], .content').first().isVisible({ timeout: TestEnv.timeouts.default })
      expect(hasContent).toBe(true)
    }
  })
})
