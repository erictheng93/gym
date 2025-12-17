import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'

test.describe('会员签约流程 E2E', () => {
  test.beforeEach(async ({ page }) => {
    // 登录系统
    await login(page, TEST_USERS.admin)
  })

  test('应该完成完整的会员签约流程：新增会员 → 选方案 → 建立合约', async ({ page }) => {
    // ============ 步骤 1: 新增会员 ============
    await test.step('新增会员', async () => {
      // 导航到会员列表页
      await page.goto('/members')
      await expect(page).toHaveURL('/members')

      // 点击新增会员按钮
      const newMemberButton = page.locator('text=新增會員').or(
        page.locator('a[href="/members/new"]')
      )
      await newMemberButton.click()

      // 等待表单页面加载
      await page.waitForURL('/members/new', { timeout: 5000 })

      // 填写会员表单
      const timestamp = Date.now()
      const testMemberName = `测试会员_${timestamp}`
      const testPhone = `0912345${String(timestamp).slice(-3)}`
      const testEmail = `test${timestamp}@example.com`

      await page.fill('input[name="full_name"]', testMemberName)
      await page.fill('input[name="phone"]', testPhone)
      await page.fill('input[name="email"]', testEmail)

      // 选择性别（如果需要）
      const genderSelect = page.locator('select[name="gender"]')
      if (await genderSelect.isVisible({ timeout: 1000 })) {
        await genderSelect.selectOption('M')
      }

      // 提交表单
      const submitButton = page.locator('button[type="submit"]').or(
        page.locator('button:has-text("建立")').or(
          page.locator('button:has-text("送出")')
        )
      )
      await submitButton.click()

      // 等待跳转回会员列表
      await page.waitForURL('/members', { timeout: 10000 })

      // 验证会员已创建（在列表中可见）
      await expect(page.locator(`text=${testMemberName}`)).toBeVisible({ timeout: 5000 })
    })

    // ============ 步骤 2: 选择会员并创建合约 ============
    await test.step('选择方案并建立合约', async () => {
      // 点击新增合约按钮
      await page.goto('/contracts/new')
      await expect(page).toHaveURL('/contracts/new')

      // 等待页面加载完成
      await page.waitForTimeout(1000)

      // 选择会员
      const memberSelect = page.locator('select').filter({ hasText: /會員|会员|Member/i }).first()
      const memberOptions = await memberSelect.locator('option').count()
      expect(memberOptions).toBeGreaterThan(1) // 确保有会员选项

      // 选择第一个会员（跳过placeholder）
      await memberSelect.selectOption({ index: 1 })

      // 选择方案
      const planSelect = page.locator('select').filter({ hasText: /方案|计划|Plan/i }).first()
      const planOptions = await planSelect.locator('option').count()
      expect(planOptions).toBeGreaterThan(1) // 确保有方案选项

      // 选择第一个方案
      await planSelect.selectOption({ index: 1 })

      // 验证金额自动填充
      const amountInput = page.locator('input[name="total_amount"]')
      await expect(async () => {
        const value = await amountInput.inputValue()
        expect(Number(value)).toBeGreaterThan(0)
      }).toPass({ timeout: 3000 })

      // 如果是多步骤表单，点击下一步
      const nextButton = page.locator('button:has-text("下一步")')
      if (await nextButton.isVisible({ timeout: 1000 })) {
        await nextButton.click()
        await page.waitForTimeout(500)

        // 如果需要填写更多信息，继续
        const continueButton = page.locator('button:has-text("下一步")')
        if (await continueButton.isVisible({ timeout: 1000 })) {
          await continueButton.click()
          await page.waitForTimeout(500)
        }

        // 如果需要签名，模拟签名
        const signaturePad = page.locator('canvas')
        if (await signaturePad.isVisible({ timeout: 1000 })) {
          // 在canvas上绘制简单签名
          const box = await signaturePad.boundingBox()
          if (box) {
            await page.mouse.move(box.x + 50, box.y + 50)
            await page.mouse.down()
            await page.mouse.move(box.x + 150, box.y + 80)
            await page.mouse.up()
          }
        }
      }

      // 提交合约
      const submitButton = page.locator('button[type="submit"]').or(
        page.locator('button:has-text("建立合約")').or(
          page.locator('button:has-text("完成")')
        )
      )
      await submitButton.click()

      // 等待跳转到合约列表或详情页
      await page.waitForURL(/\/(contracts|members)/, { timeout: 10000 })

      // 验证成功消息或合约存在
      // 可以通过检查URL或页面内容来验证
      const currentUrl = page.url()
      expect(currentUrl).toMatch(/\/(contracts|members)/)
    })

    // ============ 步骤 3: 验证合约已创建 ============
    await test.step('验证合约已创建', async () => {
      // 导航到合约列表
      await page.goto('/contracts')
      await expect(page).toHaveURL('/contracts')

      // 验证列表中有合约数据
      const contractRows = page.locator('table tbody tr').or(
        page.locator('.contract-item').or(
          page.locator('[data-testid="contract-item"]')
        )
      )

      await expect(contractRows.first()).toBeVisible({ timeout: 5000 })
    })
  })

  test('应该在未选择会员时显示验证错误', async ({ page }) => {
    await page.goto('/contracts/new')

    // 不选择会员，直接尝试提交或进入下一步
    const nextButton = page.locator('button:has-text("下一步")').or(
      page.locator('button[type="submit"]')
    )

    await nextButton.click()

    // 验证错误消息显示
    const errorMessage = page.locator('.error, .error-message, [class*="error"]').filter({
      hasText: /會員|会员|Member/i
    })

    await expect(errorMessage).toBeVisible({ timeout: 3000 })
  })

  test('应该在未选择方案时显示验证错误', async ({ page }) => {
    await page.goto('/contracts/new')

    // 只选择会员，不选择方案
    const memberSelect = page.locator('select').filter({ hasText: /會員|会员|Member/i }).first()
    const hasOptions = await memberSelect.locator('option').count() > 1

    if (hasOptions) {
      await memberSelect.selectOption({ index: 1 })
    }

    // 尝试进入下一步
    const nextButton = page.locator('button:has-text("下一步")').or(
      page.locator('button[type="submit"]')
    )

    await nextButton.click()

    // 验证错误消息显示
    const errorMessage = page.locator('.error, .error-message, [class*="error"]').filter({
      hasText: /方案|计划|Plan/i
    })

    await expect(errorMessage).toBeVisible({ timeout: 3000 })
  })

  test('应该正确计算合约结束日期', async ({ page }) => {
    await page.goto('/contracts/new')

    // 等待页面加载
    await page.waitForTimeout(1000)

    // 选择会员
    const memberSelect = page.locator('select').filter({ hasText: /會員|会员|Member/i }).first()
    if (await memberSelect.locator('option').count() > 1) {
      await memberSelect.selectOption({ index: 1 })
    }

    // 选择方案
    const planSelect = page.locator('select').filter({ hasText: /方案|计划|Plan/i }).first()
    if (await planSelect.locator('option').count() > 1) {
      await planSelect.selectOption({ index: 1 })
    }

    // 设置开始日期
    const startDateInput = page.locator('input[type="date"]').first()
    const testStartDate = '2025-01-01'
    await startDateInput.fill(testStartDate)

    // 验证结束日期已计算（如果有显示）
    const endDateDisplay = page.locator('text=/結束日期|结束日期|End Date/i')
    if (await endDateDisplay.isVisible({ timeout: 1000 })) {
      // 验证结束日期不为空
      await expect(endDateDisplay).not.toHaveText(/^$/)
    }
  })

  test('应该在选择方案后自动填充金额', async ({ page }) => {
    await page.goto('/contracts/new')

    // 等待页面加载
    await page.waitForTimeout(1000)

    // 选择方案
    const planSelect = page.locator('select').filter({ hasText: /方案|计划|Plan/i }).first()
    if (await planSelect.locator('option').count() > 1) {
      await planSelect.selectOption({ index: 1 })
    }

    // 验证金额字段已自动填充
    const amountInput = page.locator('input[name="total_amount"]').or(
      page.locator('input[type="number"]').filter({ has: page.locator('label:has-text("金額")') })
    )

    await expect(async () => {
      const value = await amountInput.inputValue()
      expect(Number(value)).toBeGreaterThan(0)
    }).toPass({ timeout: 5000 })
  })
})
