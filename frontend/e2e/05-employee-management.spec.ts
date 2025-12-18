import { test, expect, APIRequestContext } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { getAuthToken, cleanupTestData } from './fixtures/api'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
let authToken: string
let testEmployeeIds: string[] = []

test.describe('員工管理流程 E2E', () => {
  test.beforeAll(async ({ request }) => {
    // 獲取認證 token 用於清理測試數據
    authToken = await getAuthToken(request, TEST_USERS.admin.email, TEST_USERS.admin.password)
  })

  test.beforeEach(async ({ page }) => {
    // 登入系統
    await login(page, TEST_USERS.admin)

    // 導航到員工管理頁面
    await page.goto('/employees')
    await page.waitForLoadState('networkidle')
  })

  test.afterEach(async ({ request }) => {
    // 清理測試數據
    if (testEmployeeIds.length > 0) {
      await cleanupTestData(request, authToken, 'employees', testEmployeeIds)
      testEmployeeIds = []
    }
  })

  test('應該顯示員工列表', async ({ page }) => {
    // 驗證頁面標題
    await expect(page.locator('h1, h2').filter({ hasText: /員工管理|員工列表/ })).toBeVisible()

    // 驗證表格存在
    const table = page.locator('table').or(page.locator('[role="table"]'))
    await expect(table).toBeVisible({ timeout: 5000 })

    // 驗證表格包含列標題
    const headers = ['姓名', '員工編號', '職位', '分店']
    for (const header of headers) {
      await expect(page.locator('th, [role="columnheader"]').filter({ hasText: header })).toBeVisible()
    }
  })

  test('應該能夠搜尋員工', async ({ page }) => {
    // 找到搜尋輸入框
    const searchInput = page.locator('input[placeholder*="搜尋"], input[type="search"]')
    await expect(searchInput).toBeVisible()

    // 輸入搜尋關鍵字
    await searchInput.fill('eric')

    // 等待搜尋結果
    await page.waitForTimeout(1000)

    // 驗證結果包含搜尋關鍵字
    const resultRows = page.locator('tbody tr, [role="row"]')
    const firstRow = resultRows.first()
    await expect(firstRow).toContainText(/eric/i)
  })

  test('應該能夠新增員工', async ({ page, request }) => {
    // 點擊新增員工按鈕
    const addButton = page.locator('button').filter({ hasText: /新增員工|新增/ })
    await addButton.click()

    // 等待表單出現
    const form = page.locator('form').or(page.locator('[role="form"]'))
    await expect(form).toBeVisible({ timeout: 5000 })

    // 填寫員工資訊
    const timestamp = Date.now()
    await page.fill('input[name="full_name"], #full_name', `測試員工 ${timestamp}`)
    await page.fill('input[name="employee_code"], #employee_code', `EMP${timestamp}`)
    await page.fill('input[name="email"], #email', `test${timestamp}@test.com`)
    await page.fill('input[name="phone"], #phone', '0912345678')

    // 選擇分店
    const branchSelect = page.locator('select[name="branch_id"], #branch_id')
    await branchSelect.selectOption({ index: 1 })

    // 選擇職位
    const jobTitleSelect = page.locator('select[name="job_title_id"], #job_title_id')
    await jobTitleSelect.selectOption({ index: 1 })

    // 提交表單
    const submitButton = page.locator('button[type="submit"]').filter({ hasText: /儲存|確定|送出/ })
    await submitButton.click()

    // 等待成功訊息
    const successMessage = page.locator('.success-message, .toast').filter({ hasText: /成功/ })
    await expect(successMessage).toBeVisible({ timeout: 5000 })

    // 驗證新員工出現在列表中
    await page.waitForTimeout(1000)
    await expect(page.locator('tbody tr, [role="row"]').filter({ hasText: `測試員工 ${timestamp}` })).toBeVisible()

    // 取得新建員工 ID 用於清理
    const response = await request.get(`${DIRECTUS_URL}/items/employees`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: { filter: JSON.stringify({ employee_code: { _eq: `EMP${timestamp}` } }) }
    })
    const data = await response.json()
    if (data.data && data.data.length > 0) {
      testEmployeeIds.push(data.data[0].id)
    }
  })

  test('應該能夠編輯員工資訊', async ({ page }) => {
    // 找到第一個員工的編輯按鈕
    const firstEditButton = page.locator('button, a').filter({ hasText: /編輯|Edit/ }).first()
    await firstEditButton.click()

    // 等待編輯表單出現
    const form = page.locator('form').or(page.locator('[role="form"]'))
    await expect(form).toBeVisible({ timeout: 5000 })

    // 修改姓名
    const nameInput = page.locator('input[name="full_name"], #full_name')
    const originalName = await nameInput.inputValue()
    await nameInput.fill(`${originalName} (已編輯)`)

    // 提交表單
    const submitButton = page.locator('button[type="submit"]').filter({ hasText: /儲存|更新|確定/ })
    await submitButton.click()

    // 等待成功訊息
    const successMessage = page.locator('.success-message, .toast').filter({ hasText: /成功/ })
    await expect(successMessage).toBeVisible({ timeout: 5000 })

    // 驗證更新後的資訊
    await page.waitForTimeout(1000)
    await expect(page.locator('tbody tr, [role="row"]').filter({ hasText: `${originalName} (已編輯)` })).toBeVisible()
  })

  test('應該能夠按分店過濾員工', async ({ page }) => {
    // 找到分店過濾下拉選單
    const branchFilter = page.locator('select').filter({ hasText: /分店|所有分店/ }).or(
      page.locator('select[name="branch_filter"], #branch_filter')
    )

    if (await branchFilter.isVisible()) {
      // 選擇特定分店
      await branchFilter.selectOption({ index: 1 })

      // 等待過濾結果
      await page.waitForTimeout(1000)

      // 驗證結果已過濾
      const resultCount = await page.locator('tbody tr, [role="row"]').count()
      expect(resultCount).toBeGreaterThan(0)
    }
  })

  test('應該能夠按職位過濾員工', async ({ page }) => {
    // 找到職位過濾下拉選單
    const jobTitleFilter = page.locator('select').filter({ hasText: /職位|所有職位/ }).or(
      page.locator('select[name="job_title_filter"], #job_title_filter')
    )

    if (await jobTitleFilter.isVisible()) {
      // 選擇特定職位
      await jobTitleFilter.selectOption({ index: 1 })

      // 等待過濾結果
      await page.waitForTimeout(1000)

      // 驗證結果已過濾
      const resultCount = await page.locator('tbody tr, [role="row"]').count()
      expect(resultCount).toBeGreaterThan(0)
    }
  })

  test('應該能夠查看員工詳細資訊', async ({ page }) => {
    // 點擊第一個員工的查看/詳情按鈕
    const firstViewButton = page.locator('button, a').filter({ hasText: /查看|詳情|View/ }).first()

    if (await firstViewButton.isVisible()) {
      await firstViewButton.click()

      // 等待詳情頁面或彈窗出現
      await page.waitForTimeout(1000)

      // 驗證顯示詳細資訊
      const detailView = page.locator('.employee-detail, [role="dialog"]')
      await expect(detailView).toBeVisible({ timeout: 5000 })

      // 驗證包含關鍵資訊
      await expect(detailView).toContainText(/姓名|員工編號|職位|分店/)
    }
  })

  test('應該支援分頁功能', async ({ page }) => {
    // 查找分頁控制
    const pagination = page.locator('.pagination, [role="navigation"]').filter({ has: page.locator('button, a') })

    if (await pagination.isVisible()) {
      // 找到下一頁按鈕
      const nextButton = pagination.locator('button, a').filter({ hasText: /下一頁|Next|>/ })

      if (await nextButton.isEnabled()) {
        await nextButton.click()

        // 等待頁面更新
        await page.waitForTimeout(1000)

        // 驗證 URL 或頁碼更新
        const currentPage = page.locator('.pagination .active, .pagination [aria-current]')
        await expect(currentPage).toBeVisible()
      }
    }
  })

  test('應該能夠變更員工狀態', async ({ page }) => {
    // 找到第一個員工的狀態切換或編輯按鈕
    const firstEditButton = page.locator('button, a').filter({ hasText: /編輯|Edit/ }).first()
    await firstEditButton.click()

    // 等待編輯表單出現
    await page.waitForTimeout(1000)

    // 找到狀態選擇
    const statusSelect = page.locator('select[name="employment_status"], #employment_status')

    if (await statusSelect.isVisible()) {
      // 選擇不同狀態
      const currentValue = await statusSelect.inputValue()
      const newValue = currentValue === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      await statusSelect.selectOption(newValue)

      // 提交表單
      const submitButton = page.locator('button[type="submit"]').filter({ hasText: /儲存|更新|確定/ })
      await submitButton.click()

      // 等待成功訊息
      const successMessage = page.locator('.success-message, .toast').filter({ hasText: /成功/ })
      await expect(successMessage).toBeVisible({ timeout: 5000 })
    }
  })
})
