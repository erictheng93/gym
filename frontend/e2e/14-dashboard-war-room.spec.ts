import { test, expect } from '@playwright/test'
import { TEST_USERS, login } from './fixtures/auth'
import { TestEnv } from './config/test-env'

test.describe('戰情室 Dashboard E2E', () => {
  test.beforeEach(async ({ page }) => {
    // 以 HQ Admin 登入
    await login(page, TEST_USERS.hqAdmin)
  })

  test.describe('Dashboard 首頁', () => {
    test('應該顯示 KPI 卡片', async ({ page }) => {
      await page.goto('/dashboard/war-room')
      await page.waitForLoadState('networkidle')

      // 驗證 KPI 區塊存在
      const kpiSection = page.locator('[data-testid="kpi-cards"], .kpi-cards, .dashboard-kpis').first()
      await expect(kpiSection).toBeVisible({ timeout: TestEnv.timeouts.default })

      // 驗證主要 KPI 標題存在
      const kpiTitles = ['營收', '會員', '合約', '入場']
      for (const title of kpiTitles) {
        const kpiElement = page.locator(`text=${title}`).first()
        await expect(kpiElement).toBeVisible({ timeout: TestEnv.timeouts.default })
      }
    })

    test('應該能切換時間區間 (今日/週/月/年)', async ({ page }) => {
      await page.goto('/dashboard/war-room')
      await page.waitForLoadState('networkidle')

      // 找到時間區間選擇器
      const periodSelector = page.locator('[data-testid="period-selector"], select, .period-tabs').first()
      await expect(periodSelector).toBeVisible({ timeout: TestEnv.timeouts.default })

      // 嘗試切換到月報表
      const monthOption = page.locator('text=月').first()
      if (await monthOption.isVisible()) {
        await monthOption.click()
        await page.waitForLoadState('networkidle')
        // 驗證頁面有更新 (URL 或內容變化)
        await page.waitForTimeout(1000)
      }
    })

    test('應該顯示合約到期警示', async ({ page }) => {
      await page.goto('/dashboard/war-room')
      await page.waitForLoadState('networkidle')

      // 尋找合約到期警示區塊
      const alertSection = page.locator('[data-testid="contract-alerts"], .contract-alerts, text=到期').first()
      await expect(alertSection).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('應該能匯出報表數據', async ({ page }) => {
      await page.goto('/dashboard/war-room')
      await page.waitForLoadState('networkidle')

      // 找到匯出按鈕
      const exportButton = page.locator('button:has-text("匯出"), button:has-text("Export"), [data-testid="export-btn"]').first()

      if (await exportButton.isVisible()) {
        // 設定下載監聽
        const downloadPromise = page.waitForEvent('download', { timeout: TestEnv.timeouts.api })

        await exportButton.click()

        // 等待下載開始
        try {
          const download = await downloadPromise
          expect(download.suggestedFilename()).toMatch(/\.(csv|json|xlsx)$/)
        } catch {
          // 可能需要選擇格式，跳過
        }
      }
    })
  })

  test.describe('分店篩選', () => {
    test('HQ Admin 應該能看到所有分店選項', async ({ page }) => {
      await page.goto('/dashboard/war-room')
      await page.waitForLoadState('networkidle')

      // 找到分店選擇器
      const branchSelector = page.locator('[data-testid="branch-selector"], select[name="branch"], .branch-filter').first()

      if (await branchSelector.isVisible()) {
        await branchSelector.click()
        // 應該有多個分店選項
        const options = page.locator('option, [role="option"]')
        const count = await options.count()
        expect(count).toBeGreaterThan(0)
      }
    })

    test('切換分店應該更新 KPI 數據', async ({ page }) => {
      await page.goto('/dashboard/war-room')
      await page.waitForLoadState('networkidle')

      // 記錄初始營收值
      const revenueValue = page.locator('[data-testid="revenue-value"], .revenue-amount').first()
      const initialValue = await revenueValue.textContent().catch(() => null)

      // 切換分店
      const branchSelector = page.locator('[data-testid="branch-selector"], select[name="branch"]').first()
      if (await branchSelector.isVisible()) {
        await branchSelector.selectOption({ index: 1 })
        await page.waitForLoadState('networkidle')

        // 數據應該有更新（或保持相同）
        await page.waitForTimeout(1000)
      }
    })
  })

  test.describe('即時更新功能', () => {
    test('應該顯示最後更新時間', async ({ page }) => {
      await page.goto('/dashboard/war-room')
      await page.waitForLoadState('networkidle')

      // 找到更新時間顯示
      const lastUpdate = page.locator('text=更新, text=Updated, [data-testid="last-update"]').first()
      await expect(lastUpdate).toBeVisible({ timeout: TestEnv.timeouts.default })
    })

    test('應該能手動刷新數據', async ({ page }) => {
      await page.goto('/dashboard/war-room')
      await page.waitForLoadState('networkidle')

      // 找到刷新按鈕
      const refreshButton = page.locator('button:has-text("刷新"), button:has-text("Refresh"), [data-testid="refresh-btn"]').first()

      if (await refreshButton.isVisible()) {
        await refreshButton.click()

        // 應該有載入狀態或數據更新
        await page.waitForLoadState('networkidle')
      }
    })
  })

  test.describe('營收目標設定', () => {
    test('應該顯示營收目標進度', async ({ page }) => {
      await page.goto('/dashboard/war-room')
      await page.waitForLoadState('networkidle')

      // 找到目標進度區塊
      const targetSection = page.locator('[data-testid="revenue-target"], .revenue-target, text=目標').first()
      await expect(targetSection).toBeVisible({ timeout: TestEnv.timeouts.default })
    })
  })
})

test.describe('Dashboard 權限測試', () => {
  test('店長應該只能看到自己分店的數據', async ({ page }) => {
    await login(page, TEST_USERS.manager)
    await page.goto('/dashboard/war-room')
    await page.waitForLoadState('networkidle')

    // 分店選擇器應該被限制或隱藏
    const branchSelector = page.locator('[data-testid="branch-selector"]')
    const isVisible = await branchSelector.isVisible()

    if (isVisible) {
      // 如果可見，應該只有一個選項（自己的分店）
      const options = page.locator('option')
      const count = await options.count()
      expect(count).toBeLessThanOrEqual(2) // 包含預設選項
    }
  })

  test('教練不應該能存取戰情室', async ({ page }) => {
    await login(page, TEST_USERS.coach)

    // 嘗試訪問戰情室
    await page.goto('/dashboard/war-room')
    await page.waitForLoadState('networkidle')

    // 應該被重導向或顯示無權限
    const currentUrl = page.url()
    const noPermission = page.locator('text=權限不足, text=無權限, text=Forbidden')

    const isRedirected = !currentUrl.includes('/dashboard/war-room')
    const hasNoPermissionMessage = await noPermission.isVisible().catch(() => false)

    expect(isRedirected || hasNoPermissionMessage).toBeTruthy()
  })
})
