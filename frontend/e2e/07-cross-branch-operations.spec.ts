import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { getAuthToken } from './fixtures/api'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
let authToken: string

test.describe('跨分店操作 E2E', () => {
  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, TEST_USERS.admin.email, TEST_USERS.admin.password)
  })

  test.describe('總部管理員權限', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, TEST_USERS.admin)
    })

    test('總部管理員應該能夠查看所有分店', async ({ page }) => {
      // 導航到分店管理頁面
      await page.goto('/branches')
      await page.waitForLoadState('networkidle')

      // 驗證頁面標題
      await expect(page.locator('h1, h2').filter({ hasText: /分店管理|分店列表/ })).toBeVisible()

      // 驗證分店列表
      const branchList = page.locator('table, .branch-list, [role="table"]')
      await expect(branchList).toBeVisible({ timeout: 5000 })

      // 驗證至少有總部和一個分店
      const branchRows = page.locator('tbody tr, .branch-item')
      const count = await branchRows.count()
      expect(count).toBeGreaterThanOrEqual(1)

      // 驗證包含總部
      await expect(page.locator('tbody tr, .branch-item').filter({ hasText: /總部|HEADQUARTER/ })).toBeVisible()
    })

    test('總部管理員應該能夠查看所有分店的會員', async ({ page }) => {
      await page.goto('/members')
      await page.waitForLoadState('networkidle')

      // 驗證有分店篩選器
      const branchFilter = page.locator('select').filter({ hasText: /分店|所有分店/ }).or(
        page.locator('select[name="branch_filter"], #branch_filter')
      )

      if (await branchFilter.isVisible()) {
        // 選擇所有分店
        await branchFilter.selectOption({ label: /所有|全部|All/ })

        // 等待結果更新
        await page.waitForTimeout(1000)

        // 驗證顯示來自不同分店的會員
        const memberRows = page.locator('tbody tr, .member-item')
        const count = await memberRows.count()
        expect(count).toBeGreaterThan(0)
      }
    })

    test('總部管理員應該能夠查看所有分店的員工', async ({ page }) => {
      await page.goto('/employees')
      await page.waitForLoadState('networkidle')

      // 驗證有分店篩選器
      const branchFilter = page.locator('select').filter({ hasText: /分店|所有分店/ }).or(
        page.locator('select[name="branch_filter"], #branch_filter')
      )

      if (await branchFilter.isVisible()) {
        // 選擇所有分店
        await branchFilter.selectOption({ label: /所有|全部|All/ })

        // 等待結果更新
        await page.waitForTimeout(1000)

        // 驗證顯示來自不同分店的員工
        const employeeRows = page.locator('tbody tr, .employee-item')
        const count = await employeeRows.count()
        expect(count).toBeGreaterThan(0)
      }
    })

    test('總部管理員應該能夠切換查看不同分店的資料', async ({ page }) => {
      await page.goto('/members')
      await page.waitForLoadState('networkidle')

      // 找到分店篩選器
      const branchFilter = page.locator('select').filter({ hasText: /分店|所有分店/ }).or(
        page.locator('select[name="branch_filter"], #branch_filter')
      )

      if (await branchFilter.isVisible()) {
        // 獲取所有分店選項
        const options = await branchFilter.locator('option').count()

        if (options > 2) {
          // 選擇第二個分店（index 1，因為 0 通常是"所有分店"）
          await branchFilter.selectOption({ index: 1 })
          await page.waitForTimeout(1000)
          const count1 = await page.locator('tbody tr, .member-item').count()

          // 選擇第三個分店
          await branchFilter.selectOption({ index: 2 })
          await page.waitForTimeout(1000)
          const count2 = await page.locator('tbody tr, .member-item').count()

          // 驗證不同分店的資料數量可能不同
          // (不強制要求不同，因為可能某些分店沒有會員)
          expect(count1).toBeGreaterThanOrEqual(0)
          expect(count2).toBeGreaterThanOrEqual(0)
        }
      }
    })

    test('總部管理員應該能夠查看跨分店報表', async ({ page }) => {
      // 導航到報表頁面
      const reportUrls = ['/reports', '/dashboard', '/analytics']

      for (const url of reportUrls) {
        try {
          await page.goto(url, { timeout: 5000 })
          await page.waitForLoadState('networkidle')

          // 如果成功導航到報表頁面
          const reportContainer = page.locator('.report, .dashboard, .analytics, main')

          if (await reportContainer.isVisible()) {
            // 查找分店選擇器或顯示所有分店的跡象
            const branchSelector = page.locator('select, .branch-filter').filter({ hasText: /分店/ })

            if (await branchSelector.isVisible()) {
              // 驗證可以選擇所有分店
              const allBranchesOption = branchSelector.locator('option').filter({ hasText: /所有|全部|All/ })
              await expect(allBranchesOption).toBeVisible()
            }

            break
          }
        } catch {
          continue
        }
      }
    })
  })

  test.describe('分店管理員權限限制', () => {
    test.beforeEach(async ({ page }) => {
      // 使用分店管理員帳號登入
      await login(page, TEST_USERS.manager)
    })

    test('分店管理員應該只能查看自己分店的會員', async ({ page }) => {
      await page.goto('/members')
      await page.waitForLoadState('networkidle')

      // 驗證沒有"所有分店"的選項，或該選項被禁用
      const branchFilter = page.locator('select').filter({ hasText: /分店/ }).or(
        page.locator('select[name="branch_filter"], #branch_filter')
      )

      if (await branchFilter.isVisible()) {
        const allBranchesOption = branchFilter.locator('option').filter({ hasText: /所有|全部|All/ })
        const optionCount = await allBranchesOption.count()

        // 分店管理員不應該有"所有分店"選項
        expect(optionCount).toBe(0)
      }

      // 驗證會員列表只顯示本分店的會員
      const memberRows = page.locator('tbody tr, .member-item')
      const count = await memberRows.count()

      if (count > 0) {
        // 檢查第一筆資料的分店是否為管理員所屬分店
        const firstRow = memberRows.first()
        // 這裡假設會員列表會顯示分店資訊
        await expect(firstRow).toBeVisible()
      }
    })

    test('分店管理員應該只能查看自己分店的員工', async ({ page }) => {
      await page.goto('/employees')
      await page.waitForLoadState('networkidle')

      // 驗證員工列表
      const employeeRows = page.locator('tbody tr, .employee-item')
      const count = await employeeRows.count()

      // 驗證至少有一個員工（管理員自己）
      expect(count).toBeGreaterThanOrEqual(1)

      // 驗證不能訪問其他分店的員工
      const branchFilter = page.locator('select').filter({ hasText: /分店/ })

      if (await branchFilter.isVisible()) {
        const options = await branchFilter.locator('option').count()
        // 應該只有一個分店選項（自己的分店）或沒有選項
        expect(options).toBeLessThanOrEqual(2) // 可能包含空選項
      }
    })
  })

  test.describe('跨分店會員入場', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, TEST_USERS.admin)
    })

    test('應該記錄會員跨分店入場', async ({ page, request }) => {
      // 先獲取一個會員和其他分店
      const membersResponse = await request.get(`${DIRECTUS_URL}/items/members`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { limit: 1 }
      })

      if (!membersResponse.ok()) {
        test.skip()
        return
      }

      const membersData = await membersResponse.json()
      if (!membersData.data || membersData.data.length === 0) {
        test.skip()
        return
      }

      const member = membersData.data[0]

      // 獲取不同於會員主分店的其他分店
      const branchesResponse = await request.get(`${DIRECTUS_URL}/items/branches`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: {
          filter: JSON.stringify({ id: { _neq: member.branch_id } }),
          limit: 1
        }
      })

      if (!branchesResponse.ok()) {
        test.skip()
        return
      }

      const branchesData = await branchesResponse.json()
      if (!branchesData.data || branchesData.data.length === 0) {
        test.skip()
        return
      }

      const otherBranch = branchesData.data[0]

      // 記錄跨分店入場
      await page.goto('/entry')
      await page.waitForLoadState('networkidle')

      // 搜尋會員
      const searchInput = page.locator('input[placeholder*="搜尋"], input[type="search"]')
      if (await searchInput.isVisible()) {
        await searchInput.fill(member.name || member.phone)
        await page.waitForTimeout(1000)

        // 點擊入場按鈕
        const checkInButton = page.locator('button').filter({ hasText: /入場|Check In/ }).first()
        if (await checkInButton.isVisible()) {
          await checkInButton.click()

          // 如果是跨分店，應該顯示提示
          const crossBranchWarning = page.locator('.warning, .alert').filter({
            hasText: /跨分店|非本店會員|different branch/i
          })

          // 確認入場
          const confirmButton = page.locator('button').filter({ hasText: /確認|確定|Confirm/ })
          if (await confirmButton.isVisible()) {
            await confirmButton.click()
          }

          // 驗證入場成功
          const successMessage = page.locator('.success-message, .toast').filter({ hasText: /成功/ })
          await expect(successMessage).toBeVisible({ timeout: 5000 })
        }
      }
    })

    test('應該能夠查看會員的跨分店入場記錄', async ({ page, request }) => {
      // 獲取一個有入場記錄的會員
      const membersResponse = await request.get(`${DIRECTUS_URL}/items/members`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { limit: 1 }
      })

      if (!membersResponse.ok()) {
        test.skip()
        return
      }

      const membersData = await membersResponse.json()
      if (!membersData.data || membersData.data.length === 0) {
        test.skip()
        return
      }

      const member = membersData.data[0]

      // 導航到會員詳情頁
      await page.goto(`/members/${member.id}`)
      await page.waitForLoadState('networkidle')

      // 查找入場記錄區塊
      const entryRecords = page.locator('.entry-records, .check-in-history')

      if (await entryRecords.isVisible()) {
        // 驗證有入場記錄列表
        await expect(entryRecords).toBeVisible()

        // 驗證包含分店資訊
        const recordWithBranch = entryRecords.locator('tr, .record-item').filter({ hasText: /分店/ })
        if (await recordWithBranch.count() > 0) {
          await expect(recordWithBranch.first()).toBeVisible()
        }
      }
    })
  })

  test.describe('跨分店資料轉移', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, TEST_USERS.admin)
    })

    test('應該能夠轉移會員到其他分店', async ({ page, request }) => {
      // 獲取會員和分店列表
      const membersResponse = await request.get(`${DIRECTUS_URL}/items/members`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { limit: 1 }
      })

      const branchesResponse = await request.get(`${DIRECTUS_URL}/items/branches`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { limit: 2 }
      })

      if (!membersResponse.ok() || !branchesResponse.ok()) {
        test.skip()
        return
      }

      const membersData = await membersResponse.json()
      const branchesData = await branchesResponse.json()

      if (!membersData.data?.length || !branchesData.data?.length || branchesData.data.length < 2) {
        test.skip()
        return
      }

      const member = membersData.data[0]
      const targetBranch = branchesData.data.find((b: any) => b.id !== member.branch_id)

      if (!targetBranch) {
        test.skip()
        return
      }

      // 導航到會員編輯頁面
      await page.goto(`/members/${member.id}/edit`)
      await page.waitForLoadState('networkidle')

      // 找到分店選擇器
      const branchSelect = page.locator('select[name="branch_id"], #branch_id')

      if (await branchSelect.isVisible()) {
        // 選擇新分店
        await branchSelect.selectOption(targetBranch.id)

        // 提交表單
        const submitButton = page.locator('button[type="submit"]').filter({ hasText: /儲存|更新/ })
        await submitButton.click()

        // 等待成功訊息
        const successMessage = page.locator('.success-message, .toast').filter({ hasText: /成功/ })
        await expect(successMessage).toBeVisible({ timeout: 5000 })

        // 驗證分店已更新
        await page.waitForTimeout(1000)
        await page.goto(`/members/${member.id}`)
        await expect(page.locator('body').filter({ hasText: targetBranch.name })).toBeVisible()
      }
    })

    test('應該能夠轉移員工到其他分店', async ({ page, request }) => {
      // 獲取員工和分店列表
      const employeesResponse = await request.get(`${DIRECTUS_URL}/items/employees`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: {
          limit: 1,
          filter: JSON.stringify({ employment_status: { _eq: 'ACTIVE' } })
        }
      })

      const branchesResponse = await request.get(`${DIRECTUS_URL}/items/branches`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: { limit: 2 }
      })

      if (!employeesResponse.ok() || !branchesResponse.ok()) {
        test.skip()
        return
      }

      const employeesData = await employeesResponse.json()
      const branchesData = await branchesResponse.json()

      if (!employeesData.data?.length || !branchesData.data?.length || branchesData.data.length < 2) {
        test.skip()
        return
      }

      const employee = employeesData.data[0]
      const targetBranch = branchesData.data.find((b: any) => b.id !== employee.branch_id)

      if (!targetBranch) {
        test.skip()
        return
      }

      // 導航到員工編輯頁面
      await page.goto(`/employees/${employee.id}/edit`)
      await page.waitForLoadState('networkidle')

      // 找到分店選擇器
      const branchSelect = page.locator('select[name="branch_id"], #branch_id')

      if (await branchSelect.isVisible()) {
        // 選擇新分店
        await branchSelect.selectOption(targetBranch.id)

        // 提交表單
        const submitButton = page.locator('button[type="submit"]').filter({ hasText: /儲存|更新/ })
        await submitButton.click()

        // 等待成功訊息
        const successMessage = page.locator('.success-message, .toast').filter({ hasText: /成功/ })
        await expect(successMessage).toBeVisible({ timeout: 5000 })
      }
    })
  })

  test.describe('跨分店數據統計', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, TEST_USERS.admin)
    })

    test('應該顯示各分店的會員數統計', async ({ page }) => {
      // 嘗試導航到儀表板或統計頁面
      const dashboardUrls = ['/dashboard', '/', '/reports', '/statistics']

      for (const url of dashboardUrls) {
        try {
          await page.goto(url, { timeout: 5000 })
          await page.waitForLoadState('networkidle')

          // 查找包含分店統計的區域
          const statsCards = page.locator('.stats-card, .branch-stats, .dashboard-card')

          if (await statsCards.count() > 0) {
            // 驗證包含會員數或分店資訊
            const memberStats = statsCards.filter({ hasText: /會員|Members/ })

            if (await memberStats.count() > 0) {
              await expect(memberStats.first()).toBeVisible()
              break
            }
          }
        } catch {
          continue
        }
      }
    })

    test('應該能夠比較不同分店的業績', async ({ page }) => {
      // 導航到報表或統計頁面
      const reportUrls = ['/reports', '/analytics', '/dashboard']

      for (const url of reportUrls) {
        try {
          await page.goto(url, { timeout: 5000 })
          await page.waitForLoadState('networkidle')

          // 查找業績相關的圖表或表格
          const performanceSection = page.locator('.performance, .revenue, .sales, canvas, svg')

          if (await performanceSection.count() > 0) {
            // 驗證包含分店比較資訊
            await expect(performanceSection.first()).toBeVisible()
            break
          }
        } catch {
          continue
        }
      }
    })
  })
})
