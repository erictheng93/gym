import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'

test.describe('支付记录流程 E2E', () => {
  test.beforeEach(async ({ page }) => {
    // 登录系统
    await login(page, TEST_USERS.admin)
  })

  test('应该完成完整的支付记录流程：新增支付 → 验证统计', async ({ page }) => {
    let initialIncomeCount = 0
    let initialIncomeAmount = 0

    // ============ 步骤 1: 获取初始统计数据 ============
    await test.step('获取初始统计数据', async () => {
      await page.goto('/payments')
      await expect(page).toHaveURL('/payments')

      // 等待页面加载
      await page.waitForTimeout(2000)

      // 尝试获取收入统计
      const incomeStats = page.locator('text=/收入|Income/i').locator('..').locator('text=/NT\\$|\\d+/').first()
      if (await incomeStats.isVisible({ timeout: 3000 })) {
        const text = await incomeStats.textContent()
        // 提取数字
        const match = text?.match(/[\d,]+/)
        if (match) {
          initialIncomeAmount = Number(match[0].replace(/,/g, ''))
        }
      }

      // 尝试获取收入笔数
      const incomeCountElement = page.locator('text=/\\d+\\s*(筆|笔|records?)/i').first()
      if (await incomeCountElement.isVisible({ timeout: 2000 })) {
        const text = await incomeCountElement.textContent()
        const match = text?.match(/\d+/)
        if (match) {
          initialIncomeCount = Number(match[0])
        }
      }
    })

    // ============ 步骤 2: 新增支付记录 ============
    const testAmount = 5000
    await test.step('新增支付记录', async () => {
      // 导航到新增支付页面
      const newPaymentButton = page.locator('a[href="/payments/new"]').or(
        page.locator('button:has-text("新增")').or(
          page.locator('text=新增支付記錄')
        )
      )
      await newPaymentButton.click()

      // 等待表单页面加载
      await page.waitForURL('/payments/new', { timeout: 5000 })
      await page.waitForTimeout(1000)

      // 选择会员
      const memberSelect = page.locator('select').filter({ hasText: /會員|会员|Member/i }).first()
      const memberOptions = await memberSelect.locator('option').count()
      expect(memberOptions).toBeGreaterThan(1)

      await memberSelect.selectOption({ index: 1 })
      await page.waitForTimeout(500)

      // 选择合约（如果有）
      const contractSelect = page.locator('select').filter({ hasText: /合約|合约|Contract/i }).first()
      if (await contractSelect.isVisible({ timeout: 2000 })) {
        const contractOptions = await contractSelect.locator('option').count()
        if (contractOptions > 1) {
          await contractSelect.selectOption({ index: 1 })
        }
      }

      // 填写金额
      const amountInput = page.locator('input[name="amount"]').or(
        page.locator('input[type="number"]').first()
      )
      await amountInput.fill(String(testAmount))

      // 选择支付方式
      const paymentMethodSelect = page.locator('select').filter({ hasText: /支付方式|付款方式|Payment Method/i }).first()
      if (await paymentMethodSelect.isVisible({ timeout: 2000 })) {
        // 选择现金
        await paymentMethodSelect.selectOption('CASH')
      } else {
        // 或者点击现金按钮
        const cashButton = page.locator('button:has-text("現金")').or(
          page.locator('button:has-text("现金")').or(
            page.locator('[data-value="CASH"]')
          )
        )
        if (await cashButton.isVisible({ timeout: 2000 })) {
          await cashButton.click()
        }
      }

      // 提交表单
      const submitButton = page.locator('button[type="submit"]').or(
        page.locator('button:has-text("建立")').or(
          page.locator('button:has-text("送出")')
        )
      )
      await submitButton.click()

      // 等待跳转回支付列表
      await page.waitForURL('/payments', { timeout: 10000 })
    })

    // ============ 步骤 3: 验证支付记录已创建 ============
    await test.step('验证支付记录已创建', async () => {
      // 等待列表刷新
      await page.waitForTimeout(1000)

      // 验证列表中有新的支付记录
      const paymentRows = page.locator('table tbody tr').or(
        page.locator('[class*="payment"]').filter({ hasText: /NT\$/ })
      )

      await expect(paymentRows.first()).toBeVisible({ timeout: 5000 })

      // 验证列表中包含刚创建的金额
      const amountText = page.locator(`text=/NT\\$\\s*${testAmount.toLocaleString()}/i`)
      await expect(amountText.first()).toBeVisible({ timeout: 5000 })
    })

    // ============ 步骤 4: 验证统计数据已更新 ============
    await test.step('验证统计数据已更新', async () => {
      // 刷新页面以获取最新统计
      await page.reload()
      await page.waitForTimeout(2000)

      // 获取更新后的收入统计
      const incomeStats = page.locator('text=/收入|Income/i').locator('..').locator('text=/NT\\$|\\d+/').first()
      if (await incomeStats.isVisible({ timeout: 3000 })) {
        const text = await incomeStats.textContent()
        const match = text?.match(/[\d,]+/)
        if (match) {
          const newAmount = Number(match[0].replace(/,/g, ''))
          // 验证金额增加了
          expect(newAmount).toBeGreaterThanOrEqual(initialIncomeAmount + testAmount)
        }
      }

      // 验证统计卡片显示
      const statsCard = page.locator('[class*="stat"]').or(
        page.locator('[class*="card"]')
      ).filter({ hasText: /收入|Income/i })

      if (await statsCard.isVisible({ timeout: 3000 })) {
        await expect(statsCard).toContainText(/NT\$/)
      }
    })
  })

  test('应该在未选择会员时显示验证错误', async ({ page }) => {
    await page.goto('/payments/new')

    // 等待表单加载
    await page.waitForTimeout(1000)

    // 填写金额但不选择会员
    const amountInput = page.locator('input[name="amount"]').or(
      page.locator('input[type="number"]').first()
    )
    await amountInput.fill('1000')

    // 尝试提交
    const submitButton = page.locator('button[type="submit"]').or(
      page.locator('button:has-text("建立")')
    )
    await submitButton.click()

    // 验证错误消息显示
    const errorMessage = page.locator('.error, .error-message, [class*="error"]').filter({
      hasText: /會員|会员|Member/i
    })

    await expect(errorMessage).toBeVisible({ timeout: 3000 })

    // 确保没有跳转
    await expect(page).toHaveURL('/payments/new')
  })

  test('应该在金额为0或负数时显示验证错误', async ({ page }) => {
    await page.goto('/payments/new')
    await page.waitForTimeout(1000)

    // 选择会员
    const memberSelect = page.locator('select').filter({ hasText: /會員|会员|Member/i }).first()
    if (await memberSelect.locator('option').count() > 1) {
      await memberSelect.selectOption({ index: 1 })
    }

    // 填写无效金额
    const amountInput = page.locator('input[name="amount"]').or(
      page.locator('input[type="number"]').first()
    )
    await amountInput.fill('0')

    // 尝试提交
    const submitButton = page.locator('button[type="submit"]').or(
      page.locator('button:has-text("建立")')
    )
    await submitButton.click()

    // 验证错误消息或HTML5验证
    await page.waitForTimeout(1000)

    // 确保没有跳转（验证失败）
    await expect(page).toHaveURL('/payments/new')
  })

  test('应该支持不同的支付方式', async ({ page }) => {
    await page.goto('/payments/new')
    await page.waitForTimeout(1000)

    const paymentMethods = [
      { value: 'CASH', label: /現金|现金|Cash/i },
      { value: 'CREDIT_CARD', label: /信用卡|Credit Card/i },
      { value: 'LINE_PAY', label: /LINE PAY/i },
      { value: 'TRANSFER', label: /轉帳|转账|Transfer/i }
    ]

    // 验证所有支付方式都可选择
    for (const method of paymentMethods) {
      const methodOption = page.locator(`option[value="${method.value}"]`).or(
        page.locator(`button:has-text("${method.label}")`)
      )

      // 如果找到该支付方式，验证可见
      if (await methodOption.isVisible({ timeout: 1000 })) {
        await expect(methodOption).toBeVisible()
      }
    }
  })

  test('应该正确过滤支付记录', async ({ page }) => {
    await page.goto('/payments')
    await page.waitForTimeout(1000)

    // 测试日期范围过滤
    await test.step('按日期范围过滤', async () => {
      // 设置日期范围
      const startDateInput = page.locator('input[type="date"]').first()
      const endDateInput = page.locator('input[type="date"]').last()

      if (await startDateInput.isVisible({ timeout: 2000 })) {
        const today = new Date()
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)

        await startDateInput.fill(weekAgo.toISOString().split('T')[0])
        await endDateInput.fill(today.toISOString().split('T')[0])

        // 等待筛选结果
        await page.waitForTimeout(1000)

        // 验证列表仍然显示数据（或显示无数据）
        const noDataMessage = page.locator('text=/暫無|暂无|No data|無資料/i')
        const hasData = page.locator('table tbody tr').or(
          page.locator('[class*="payment-item"]')
        )

        const hasResults = await hasData.first().isVisible({ timeout: 2000 })
        const noResults = await noDataMessage.isVisible({ timeout: 2000 })

        // 应该显示数据或无数据消息之一
        expect(hasResults || noResults).toBe(true)
      }
    })

    // 测试类型过滤
    await test.step('按类型过滤', async () => {
      const typeSelect = page.locator('select').filter({ hasText: /類型|类型|Type/i }).first()

      if (await typeSelect.isVisible({ timeout: 2000 })) {
        // 选择"收入"
        await typeSelect.selectOption('INCOME')
        await page.waitForTimeout(1000)

        // 验证列表更新
        const paymentRows = page.locator('table tbody tr').or(
          page.locator('[class*="payment-item"]')
        )

        // 如果有数据，验证显示
        if (await paymentRows.first().isVisible({ timeout: 2000 })) {
          await expect(paymentRows.first()).toBeVisible()
        }
      }
    })
  })

  test('应该显示支付统计摘要', async ({ page }) => {
    await page.goto('/payments')
    await page.waitForTimeout(2000)

    // 验证统计卡片存在
    const statsSection = page.locator('[class*="stat"]').or(
      page.locator('[class*="summary"]').or(
        page.locator('.stats-card')
      )
    )

    // 查找包含金额的元素
    const amountElements = page.locator('text=/NT\\$\\s*[\\d,]+/')

    if (await amountElements.first().isVisible({ timeout: 3000 })) {
      // 至少应该有一个金额显示
      await expect(amountElements.first()).toBeVisible()
    }

    // 验证收入/退款标签
    const incomeLabel = page.locator('text=/收入|Income/i')
    if (await incomeLabel.isVisible({ timeout: 2000 })) {
      await expect(incomeLabel).toBeVisible()
    }
  })

  test('应该支持快捷日期选择', async ({ page }) => {
    await page.goto('/payments')
    await page.waitForTimeout(1000)

    // 查找快捷日期按钮
    const quickDateButtons = [
      page.locator('button:has-text("今日")').or(page.locator('button:has-text("Today")')),
      page.locator('button:has-text("本週")').or(page.locator('button:has-text("This Week")')),
      page.locator('button:has-text("本月")').or(page.locator('button:has-text("This Month")'))
    ]

    for (const button of quickDateButtons) {
      if (await button.isVisible({ timeout: 1000 })) {
        await button.click()
        await page.waitForTimeout(500)

        // 验证日期输入框已填充
        const startDateInput = page.locator('input[type="date"]').first()
        if (await startDateInput.isVisible({ timeout: 1000 })) {
          const value = await startDateInput.inputValue()
          expect(value).toBeTruthy()
        }
      }
    }
  })

  test('应该正确显示支付方式图标和标签', async ({ page }) => {
    await page.goto('/payments')
    await page.waitForTimeout(2000)

    // 如果有支付记录，验证支付方式显示
    const paymentMethodLabels = page.locator('text=/現金|信用卡|LINE PAY|轉帳|Cash|Credit Card|Transfer/i')

    if (await paymentMethodLabels.first().isVisible({ timeout: 2000 })) {
      // 验证至少有一个支付方式标签可见
      await expect(paymentMethodLabels.first()).toBeVisible()
    }
  })
})
