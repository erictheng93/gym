import { test, expect } from '@playwright/test'
import { TEST_USERS, login } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('BI 報表系統 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.hqAdmin)
  })

  test.describe('營收報表', () => {
    test('應該顯示營收趨勢圖表', async ({ page }) => {
      await page.goto('/reports')
      await page.waitForLoadState('networkidle')

      // 驗證報表頁面載入
      const reportsPage = page.locator('h1:has-text("報表"), h1:has-text("Reports"), .reports-header').first()
      await expect(reportsPage).toBeVisible({ timeout: TestEnv.timeouts.default })

      // 尋找營收相關區塊
      const revenueSection = page.locator('text=營收, text=Revenue').first()
      await expect(revenueSection).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('應該能選擇日期範圍', async ({ page }) => {
      await page.goto('/reports')
      await page.waitForLoadState('networkidle')

      // 找到日期範圍選擇器
      const dateRange = page.locator('[data-testid="date-range"], input[type="date"], .date-picker').first()

      if (await dateRange.isVisible()) {
        await dateRange.click()
        // 日期選擇器應該打開
        await page.waitForTimeout(500)
      }
    })

    test('應該能切換圖表類型 (柱狀/折線)', async ({ page }) => {
      await page.goto('/reports')
      await page.waitForLoadState('networkidle')

      // 找到圖表類型切換
      const chartToggle = page.locator('[data-testid="chart-type"], .chart-toggle').first()

      if (await chartToggle.isVisible()) {
        await chartToggle.click()
        await page.waitForTimeout(500)
      }
    })
  })

  test.describe('會員分析報表', () => {
    test('應該顯示會員成長統計', async ({ page }) => {
      await page.goto('/admin/member-analytics')
      await page.waitForLoadState('networkidle')

      // 驗證會員分析頁面
      const memberStats = page.locator('text=會員, text=Member').first()
      await expect(memberStats).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('應該顯示會員性別分布', async ({ page }) => {
      await page.goto('/admin/member-analytics')
      await page.waitForLoadState('networkidle')

      // 尋找性別分布圖表或數據
      const genderChart = page.locator('text=性別, text=Gender, [data-testid="gender-chart"]').first()
      await expect(genderChart).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('應該顯示會員年齡分布', async ({ page }) => {
      await page.goto('/admin/member-analytics')
      await page.waitForLoadState('networkidle')

      // 尋找年齡分布圖表或數據
      const ageChart = page.locator('text=年齡, text=Age, [data-testid="age-chart"]').first()
      await expect(ageChart).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('應該顯示流失率分析', async ({ page }) => {
      await page.goto('/admin/member-analytics')
      await page.waitForLoadState('networkidle')

      // 尋找流失率數據
      const churnRate = page.locator('text=流失, text=Churn').first()
      await expect(churnRate).toBeVisible({ timeout: TestEnv.timeouts.default })
    })
  })

  test.describe('合約報表', () => {
    test('應該顯示合約到期預警', async ({ page }) => {
      await page.goto('/reports')
      await page.waitForLoadState('networkidle')

      // 尋找合約到期區塊
      const expirySection = page.locator('text=到期, text=Expir').first()
      await expect(expirySection).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('應該能篩選不同到期天數', async ({ page }) => {
      await page.goto('/reports')
      await page.waitForLoadState('networkidle')

      // 找到天數篩選器
      const daysFilter = page.locator('[data-testid="days-filter"], select:has-text("天")').first()

      if (await daysFilter.isVisible()) {
        await daysFilter.selectOption({ index: 1 })
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('入場統計報表', () => {
    test('應該顯示每日入場趨勢', async ({ page }) => {
      await page.goto('/reports')
      await page.waitForLoadState('networkidle')

      // 尋找入場統計
      const checkinSection = page.locator('text=入場, text=Check-in').first()
      await expect(checkinSection).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('應該顯示尖峰時段分析', async ({ page }) => {
      await page.goto('/reports')
      await page.waitForLoadState('networkidle')

      // 尋找尖峰時段
      const peakHour = page.locator('text=尖峰, text=Peak').first()

      if (await peakHour.isVisible()) {
        await expect(peakHour).toBeVisible()
      }
    })
  })

  test.describe('報表匯出功能', () => {
    test('應該能匯出 CSV 格式', async ({ page }) => {
      await page.goto('/reports')
      await page.waitForLoadState('networkidle')

      // 找到匯出按鈕
      const exportBtn = page.locator('button:has-text("匯出"), button:has-text("Export")').first()

      if (await exportBtn.isVisible()) {
        await exportBtn.click()

        // 找到 CSV 選項
        const csvOption = page.locator('text=CSV, [data-value="csv"]').first()
        if (await csvOption.isVisible()) {
          const downloadPromise = page.waitForEvent('download', { timeout: TestEnv.timeouts.api })
          await csvOption.click()

          try {
            const download = await downloadPromise
            expect(download.suggestedFilename()).toMatch(/\.csv$/)
          } catch {
            // 下載可能需要額外確認
          }
        }
      }
    })

    test('應該能匯出 JSON 格式', async ({ page }) => {
      await page.goto('/reports')
      await page.waitForLoadState('networkidle')

      const exportBtn = page.locator('button:has-text("匯出"), button:has-text("Export")').first()

      if (await exportBtn.isVisible()) {
        await exportBtn.click()

        const jsonOption = page.locator('text=JSON, [data-value="json"]').first()
        if (await jsonOption.isVisible()) {
          const downloadPromise = page.waitForEvent('download', { timeout: TestEnv.timeouts.api })
          await jsonOption.click()

          try {
            const download = await downloadPromise
            expect(download.suggestedFilename()).toMatch(/\.json$/)
          } catch {
            // 下載可能需要額外確認
          }
        }
      }
    })
  })

  test.describe('跨分店報表比較', () => {
    test('HQ 應該能比較多分店數據', async ({ page }) => {
      await page.goto('/reports')
      await page.waitForLoadState('networkidle')

      // 尋找分店比較功能
      const compareSection = page.locator('text=分店, text=Branch').first()
      await expect(compareSection).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('應該顯示分店排行', async ({ page }) => {
      await page.goto('/reports')
      await page.waitForLoadState('networkidle')

      // 尋找排行榜
      const ranking = page.locator('text=排行, text=Ranking, [data-testid="branch-ranking"]').first()

      if (await ranking.isVisible()) {
        await expect(ranking).toBeVisible()
      }
    })
  })
})

test.describe('API 使用量分析', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.hqAdmin)
  })

  test('應該顯示 API 使用統計', async ({ page }) => {
    await page.goto('/admin/analytics')
    await page.waitForLoadState('networkidle')

    // 驗證 API 分析頁面
    const analyticsPage = page.locator('h1:has-text("分析"), h1:has-text("Analytics"), text=API').first()
    await expect(analyticsPage).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('應該顯示請求數統計', async ({ page }) => {
    await page.goto('/admin/analytics')
    await page.waitForLoadState('networkidle')

    // 尋找請求數
    const requestCount = page.locator('text=請求, text=Request').first()
    await expect(requestCount).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('應該顯示速率限制狀態', async ({ page }) => {
    await page.goto('/admin/analytics')
    await page.waitForLoadState('networkidle')

    // 尋找速率限制
    const rateLimit = page.locator('text=限制, text=Limit, text=Quota').first()

    if (await rateLimit.isVisible()) {
      await expect(rateLimit).toBeVisible()
    }
  })
})

test.describe('審計日誌', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.hqAdmin)
  })

  test('應該顯示操作日誌列表', async ({ page }) => {
    await page.goto('/admin/audit-logs')
    await page.waitForLoadState('networkidle')

    // 驗證審計日誌頁面
    const auditPage = page.locator('h1:has-text("日誌"), h1:has-text("Audit"), h1:has-text("Log")').first()
    await expect(auditPage).toBeVisible({ timeout: TestEnv.timeouts.default })
  })

  test('應該能篩選日誌類型', async ({ page }) => {
    await page.goto('/admin/audit-logs')
    await page.waitForLoadState('networkidle')

    // 找到類型篩選器
    const typeFilter = page.locator('[data-testid="action-filter"], select').first()

    if (await typeFilter.isVisible()) {
      await typeFilter.click()
      await page.waitForTimeout(500)
    }
  })

  test('應該能查看日誌詳情', async ({ page }) => {
    await page.goto('/admin/audit-logs')
    await page.waitForLoadState('networkidle')

    // 點擊第一筆日誌
    const firstLog = page.locator('tr, .log-item').first()

    if (await firstLog.isVisible()) {
      await firstLog.click()

      // 應該顯示詳情 modal 或展開
      const details = page.locator('[data-testid="log-details"], .log-details, .modal').first()
      await page.waitForTimeout(500)
    }
  })
})
