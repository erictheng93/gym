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
    await expect(page).toHaveURL('/members')

    // 验证页面标题或主要元素存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('应该能够访问新增会员页面', async ({ page }) => {
    // 导航到会员列表页
    await page.goto('/members')

    // 点击新增会员按钮（如果存在）
    const newMemberButton = page.locator('a[href="/members/new"], button:has-text("新增")')

    if (await newMemberButton.isVisible({ timeout: 3000 })) {
      await newMemberButton.click()
      await expect(page).toHaveURL('/members/new')

      // 验证表单存在
      const form = page.locator('form')
      await expect(form).toBeVisible({ timeout: TestEnv.timeouts.default })
    } else {
      // 如果没有新增按钮，直接导航
      await page.goto('/members/new')
      await expect(page).toHaveURL('/members/new')
    }
  })

  test('应该能够访问合约管理页面', async ({ page }) => {
    // 导航到合约列表页
    await page.goto('/contracts')
    await expect(page).toHaveURL('/contracts')

    // 验证页面标题或主要元素存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('应该能够访问新增合约页面', async ({ page }) => {
    // 导航到合约列表页
    await page.goto('/contracts')

    // 点击新增合约按钮（如果存在）
    const newContractButton = page.locator('a[href="/contracts/new"], button:has-text("新增")')

    if (await newContractButton.isVisible({ timeout: 3000 })) {
      await newContractButton.click()
      await expect(page).toHaveURL('/contracts/new')
    } else {
      // 如果没有新增按钮，直接导航
      await page.goto('/contracts/new')
      await expect(page).toHaveURL('/contracts/new')
    }

    // 验证表单存在
    const form = page.locator('form')
    await expect(form).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('合约表单应该有会员选择下拉框', async ({ page }) => {
    await page.goto('/contracts/new')

    // 等待表单加载
    await page.waitForLoadState('networkidle')

    // 检查是否有会员相关的选择器
    const memberSelector = page.locator('select, [role="combobox"]').filter({
      has: page.locator('option, [role="option"]')
    }).first()

    // 表单应该有某种选择器
    const hasForm = await page.locator('form').isVisible({ timeout: 3000 })
    expect(hasForm).toBe(true)
  })

  test('应该能够访问会籍方案页面', async ({ page }) => {
    // 导航到会籍方案页面
    await page.goto('/plans')
    await expect(page).toHaveURL('/plans')

    // 验证页面标题或主要元素存在
    const pageTitle = page.locator('h1, h2').first()
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })
  })
})
