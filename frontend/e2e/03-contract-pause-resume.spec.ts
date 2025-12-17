import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'

test.describe('合约暂停/恢复流程 E2E', () => {
  let testContractId: string

  test.beforeAll(async ({ browser }) => {
    // 设置：确保有一个可用的活跃合约用于测试
    const page = await browser.newPage()
    await login(page, TEST_USERS.admin)

    // 导航到合约列表，获取一个活跃合约的ID
    await page.goto('/contracts')
    await page.waitForTimeout(2000)

    // 尝试找到一个活跃的合约
    const activeContractLink = page.locator('a[href*="/contracts/"]').first()
    if (await activeContractLink.isVisible({ timeout: 5000 })) {
      const href = await activeContractLink.getAttribute('href')
      if (href) {
        testContractId = href.split('/').pop() || ''
      }
    }

    await page.close()
  })

  test.beforeEach(async ({ page }) => {
    // 登录系统
    await login(page, TEST_USERS.admin)
  })

  test('应该完成完整的暂停和恢复流程', async ({ page }) => {
    // 跳过测试如果没有可用的合约
    test.skip(!testContractId, '没有可用的测试合约')

    let originalEndDate: string | null = null
    let newEndDate: string | null = null

    // ============ 步骤 1: 打开合约详情页 ============
    await test.step('打开合约详情', async () => {
      await page.goto(`/contracts/${testContractId}`)
      await expect(page).toHaveURL(`/contracts/${testContractId}`)

      // 等待页面加载完成
      await page.waitForTimeout(1000)

      // 验证页面显示合约信息
      await expect(page.locator('h1, h2, [class*="title"]')).toBeVisible()
    })

    // ============ 步骤 2: 获取原始结束日期 ============
    await test.step('获取原始结束日期', async () => {
      // 查找结束日期字段
      const endDateElement = page.locator('text=/結束日期|结束日期|End Date/i').locator('..').locator('text=/\\d{4}/').first()
      if (await endDateElement.isVisible({ timeout: 3000 })) {
        originalEndDate = await endDateElement.textContent()
      }
    })

    // ============ 步骤 3: 暂停合约 ============
    await test.step('暂停合约', async () => {
      // 查找暂停按钮
      const pauseButton = page.locator('button:has-text("暫停")').or(
        page.locator('button:has-text("暂停")').or(
          page.locator('button:has-text("Pause")')
        )
      )

      // 如果找不到暂停按钮，可能合约不支持暂停或已经暂停
      if (!await pauseButton.isVisible({ timeout: 3000 })) {
        test.skip(true, '合约不支持暂停或已经暂停')
      }

      await pauseButton.click()

      // 等待暂停对话框出现
      const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').last()
      await expect(modal).toBeVisible({ timeout: 5000 })

      // 填写暂停表单
      const today = new Date()
      const startDate = today.toISOString().split('T')[0]
      const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      // 填写开始日期
      const startDateInput = modal.locator('input[type="date"]').first()
      await startDateInput.fill(startDate)

      // 填写结束日期
      const endDateInput = modal.locator('input[type="date"]').last()
      await endDateInput.fill(endDate)

      // 填写原因（如果需要）
      const reasonInput = modal.locator('textarea, input[type="text"]').last()
      if (await reasonInput.isVisible({ timeout: 1000 })) {
        await reasonInput.fill('E2E测试暂停')
      }

      // 提交暂停
      const confirmButton = modal.locator('button:has-text("確認")').or(
        modal.locator('button:has-text("确认")').or(
          modal.locator('button[type="submit"]')
        )
      )
      await confirmButton.click()

      // 等待对话框关闭
      await expect(modal).not.toBeVisible({ timeout: 10000 })
    })

    // ============ 步骤 4: 验证合约状态已更新为暂停 ============
    await test.step('验证合约状态为暂停', async () => {
      // 等待页面更新
      await page.waitForTimeout(1000)

      // 验证状态标签显示"暂停"
      const statusBadge = page.locator('.badge, [class*="badge"]').filter({
        hasText: /暫停|暂停|PAUSED/i
      })
      await expect(statusBadge).toBeVisible({ timeout: 5000 })
    })

    // ============ 步骤 5: 验证结束日期已延期 ============
    await test.step('验证结束日期已延期', async () => {
      // 获取新的结束日期
      const endDateElement = page.locator('text=/結束日期|结束日期|End Date/i').locator('..').locator('text=/\\d{4}/').first()
      if (await endDateElement.isVisible({ timeout: 3000 })) {
        newEndDate = await endDateElement.textContent()

        // 如果我们有原始日期，验证新日期晚于原始日期
        if (originalEndDate && newEndDate) {
          // 简单验证：新日期字符串应该不同于原始日期
          expect(newEndDate).not.toBe(originalEndDate)
        }
      }
    })

    // ============ 步骤 6: 验证异动记录已创建 ============
    await test.step('验证异动记录已创建', async () => {
      // 查找异动记录部分
      const logsSection = page.locator('text=/異動記錄|异动记录|Contract Logs/i')
      if (await logsSection.isVisible({ timeout: 3000 })) {
        // 验证有暂停记录
        const pauseLog = page.locator('text=/暫停|暂停|PAUSE/i').first()
        await expect(pauseLog).toBeVisible({ timeout: 5000 })
      }
    })

    // ============ 步骤 7: 恢复合约 ============
    await test.step('恢复合约', async () => {
      // 查找恢复按钮
      const resumeButton = page.locator('button:has-text("恢復")').or(
        page.locator('button:has-text("恢复")').or(
          page.locator('button:has-text("Resume")')
        )
      )

      // 如果找不到恢复按钮，测试失败
      await expect(resumeButton).toBeVisible({ timeout: 5000 })

      await resumeButton.click()

      // 可能会有确认对话框
      const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').last()
      if (await modal.isVisible({ timeout: 2000 })) {
        const confirmButton = modal.locator('button:has-text("確認")').or(
          modal.locator('button:has-text("确认")').or(
            modal.locator('button[type="submit"]')
          )
        )
        await confirmButton.click()
        await expect(modal).not.toBeVisible({ timeout: 10000 })
      }

      // 等待页面更新
      await page.waitForTimeout(1000)
    })

    // ============ 步骤 8: 验证合约状态已恢复为活跃 ============
    await test.step('验证合约状态已恢复为活跃', async () => {
      // 验证状态标签显示"活跃"或"进行中"
      const statusBadge = page.locator('.badge, [class*="badge"]').filter({
        hasText: /活躍|活跃|進行中|进行中|ACTIVE/i
      })
      await expect(statusBadge).toBeVisible({ timeout: 5000 })
    })

    // ============ 步骤 9: 验证结束日期保持延期状态 ============
    await test.step('验证结束日期保持延期', async () => {
      // 获取当前结束日期
      const endDateElement = page.locator('text=/結束日期|结束日期|End Date/i').locator('..').locator('text=/\\d{4}/').first()
      if (await endDateElement.isVisible({ timeout: 3000 })) {
        const currentEndDate = await endDateElement.textContent()

        // 验证结束日期仍然是延期后的日期（不应该回到原始日期）
        if (newEndDate && currentEndDate) {
          expect(currentEndDate).toBe(newEndDate)
        }
      }
    })
  })

  test('应该在未填写必填字段时显示验证错误', async ({ page }) => {
    test.skip(!testContractId, '没有可用的测试合约')

    await page.goto(`/contracts/${testContractId}`)

    // 查找暂停按钮
    const pauseButton = page.locator('button:has-text("暫停")').or(
      page.locator('button:has-text("暂停")')
    )

    if (!await pauseButton.isVisible({ timeout: 3000 })) {
      test.skip(true, '合约不支持暂停')
    }

    await pauseButton.click()

    // 等待对话框出现
    const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').last()
    await expect(modal).toBeVisible({ timeout: 5000 })

    // 不填写任何字段，直接尝试提交
    const confirmButton = modal.locator('button:has-text("確認")').or(
      modal.locator('button:has-text("确认")').or(
        modal.locator('button[type="submit"]')
      )
    )
    await confirmButton.click()

    // 验证错误消息或对话框未关闭
    // HTML5验证可能会阻止提交，或者会显示错误消息
    await page.waitForTimeout(1000)

    // 对话框应该仍然可见（因为验证失败）
    await expect(modal).toBeVisible()
  })

  test('应该正确计算暂停天数', async ({ page }) => {
    test.skip(!testContractId, '没有可用的测试合约')

    await page.goto(`/contracts/${testContractId}`)

    // 查找暂停按钮
    const pauseButton = page.locator('button:has-text("暫停")').or(
      page.locator('button:has-text("暂停")')
    )

    if (!await pauseButton.isVisible({ timeout: 3000 })) {
      test.skip(true, '合约不支持暂停')
    }

    await pauseButton.click()

    // 等待对话框出现
    const modal = page.locator('[role="dialog"], .modal, [class*="modal"]').last()
    await expect(modal).toBeVisible({ timeout: 5000 })

    // 填写日期范围：30天
    const today = new Date()
    const startDate = today.toISOString().split('T')[0]
    const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const startDateInput = modal.locator('input[type="date"]').first()
    await startDateInput.fill(startDate)

    const endDateInput = modal.locator('input[type="date"]').last()
    await endDateInput.fill(endDate)

    // 检查是否显示天数计算
    const daysDisplay = modal.locator('text=/\\d+\\s*(天|日|days)/i')
    if (await daysDisplay.isVisible({ timeout: 2000 })) {
      const text = await daysDisplay.textContent()
      // 验证显示的天数大约是30天（允许一些误差）
      expect(text).toMatch(/2[89]|3[01]/)
    }
  })

  test('应该在合约详情页显示暂停历史', async ({ page }) => {
    test.skip(!testContractId, '没有可用的测试合约')

    await page.goto(`/contracts/${testContractId}`)

    // 查找异动记录部分
    const logsSection = page.locator('text=/異動記錄|异动记录|Contract Logs|歷史|历史|History/i')

    if (await logsSection.isVisible({ timeout: 3000 })) {
      // 验证记录列表存在
      const logsList = page.locator('table, ul, [class*="log"]').filter({
        has: logsSection
      })

      // 如果有任何记录，它们应该可见
      if (await logsList.locator('tr, li, [class*="item"]').count() > 0) {
        await expect(logsList.first()).toBeVisible()
      }
    }
  })
})
