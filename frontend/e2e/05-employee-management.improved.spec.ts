/**
 * 員工管理流程 E2E 測試 - 改進版本
 *
 * 改進內容：
 * 1. 使用測試輔助工具替換硬編碼等待（waitForTimeout）
 * 2. 使用更穩定的選擇器策略，減少對中文文本的依賴
 * 3. 使用環境配置管理測試配置
 */

import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { getAuthToken, cleanupTestData } from './fixtures/api'
import { TestEnv } from './config/test-env'

// 輔助工具導入
import {
  waitForTableData,
  waitForSuccessMessage,
  waitForSearchResults,
  waitForFilterResults,
} from './helpers/wait-helpers'

import {
  findButton,
  findInput,
  findSelect,
  findTable,
  findTableRow,
  findPageTitle,
  BilingualSelectors,
} from './helpers/selector-helpers'

let authToken: string
let testEmployeeIds: string[] = []

test.describe('員工管理流程 E2E - 改進版', () => {
  test.beforeAll(async ({ request }) => {
    // 獲取認證 token 用於清理測試數據
    authToken = await getAuthToken(
      request,
      TEST_USERS.admin.email,
      TEST_USERS.admin.password
    )
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
    // 驗證頁面標題（使用雙語選擇器）
    const pageTitle = findPageTitle(page, /員工管理|員工列表|Employee/)
    await expect(pageTitle).toBeVisible({ timeout: TestEnv.timeouts.default })

    // 驗證表格存在並等待數據加載
    const table = findTable(page, { role: true })
    await waitForTableData(page, 'table, [role="table"]', 0, TestEnv.timeouts.default)
    await expect(table).toBeVisible()

    // 驗證表格包含列標題
    const headers = ['姓名', '員工編號', '職位', '分店']
    for (const header of headers) {
      const headerElement = page
        .locator('th, [role="columnheader"]')
        .filter({ hasText: header })
      await expect(headerElement).toBeVisible()
    }
  })

  test('應該能夠搜尋員工', async ({ page }) => {
    // 找到搜尋輸入框（優先使用 name 或 type，其次使用 placeholder）
    const searchInput = findInput(page, {
      placeholder: /搜尋|Search/,
    }).or(page.locator('input[type="search"]'))

    await expect(searchInput).toBeVisible({ timeout: TestEnv.timeouts.default })

    // 使用等待輔助工具處理搜尋
    await waitForSearchResults(
      page,
      searchInput,
      'eric',
      'tbody tr, [role="row"]',
      TestEnv.timeouts.api
    )

    // 驗證結果包含搜尋關鍵字
    const resultRows = page.locator('tbody tr, [role="row"]')
    const firstRow = resultRows.first()
    await expect(firstRow).toContainText(/eric/i)
  })

  test('應該能夠新增員工', async ({ page, request }) => {
    // 點擊新增員工按鈕（使用雙語選擇器）
    const addButton = findButton(page, { text: BilingualSelectors.add })
    await addButton.click()

    // 等待表單出現
    const form = page.locator('form, [role="form"]')
    await expect(form).toBeVisible({ timeout: TestEnv.timeouts.default })

    // 填寫員工資訊
    const timestamp = Date.now()

    const nameInput = findInput(form, { name: 'full_name' }).or(form.locator('#full_name'))
    await nameInput.fill(`測試員工 ${timestamp}`)

    const codeInput = findInput(form, { name: 'employee_code' }).or(form.locator('#employee_code'))
    await codeInput.fill(`EMP${timestamp}`)

    const emailInput = findInput(form, { name: 'email', type: 'email' }).or(form.locator('#email'))
    await emailInput.fill(`test${timestamp}@test.com`)

    const phoneInput = findInput(form, { name: 'phone', type: 'tel' }).or(form.locator('#phone'))
    await phoneInput.fill('0912345678')

    // 選擇分店
    const branchSelect = findSelect(form, { name: 'branch_id' }).or(form.locator('#branch_id'))
    await branchSelect.selectOption({ index: 1 })

    // 選擇職位
    const jobTitleSelect = findSelect(form, { name: 'job_title_id' }).or(form.locator('#job_title_id'))
    await jobTitleSelect.selectOption({ index: 1 })

    // 提交表單（使用雙語選擇器）
    const submitButton = findButton(form, { text: BilingualSelectors.submit }).or(
      form.locator('button[type="submit"]')
    )
    await submitButton.click()

    // 使用等待輔助工具等待成功訊息
    await waitForSuccessMessage(page, BilingualSelectors.success, TestEnv.timeouts.default)

    // 等待表格數據更新
    await waitForTableData(page, 'table, [role="table"]', 1, TestEnv.timeouts.api)

    // 驗證新員工出現在列表中
    const table = findTable(page)
    const newEmployeeRow = findTableRow(table, `測試員工 ${timestamp}`)
    await expect(newEmployeeRow).toBeVisible()

    // 取得新建員工 ID 用於清理
    const response = await request.get(`${TestEnv.directusUrl}/items/employees`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: {
        filter: JSON.stringify({ employee_code: { _eq: `EMP${timestamp}` } }),
      },
    })
    const data = await response.json()
    if (data.data && data.data.length > 0) {
      testEmployeeIds.push(data.data[0].id)
    }
  })

  test('應該能夠編輯員工資訊', async ({ page }) => {
    // 找到第一個員工的編輯按鈕（使用雙語選擇器）
    const firstEditButton = findButton(page, { text: BilingualSelectors.edit }).first()
    await firstEditButton.click()

    // 等待編輯表單出現
    const form = page.locator('form, [role="form"]')
    await expect(form).toBeVisible({ timeout: TestEnv.timeouts.default })

    // 修改姓名
    const nameInput = findInput(form, { name: 'full_name' }).or(form.locator('#full_name'))
    const originalName = await nameInput.inputValue()
    await nameInput.fill(`${originalName} (已編輯)`)

    // 提交表單
    const submitButton = findButton(form, { text: BilingualSelectors.submit }).or(
      form.locator('button[type="submit"]')
    )
    await submitButton.click()

    // 等待成功訊息
    await waitForSuccessMessage(page, BilingualSelectors.success, TestEnv.timeouts.default)

    // 等待表格更新
    await waitForTableData(page, 'table, [role="table"]', 1, TestEnv.timeouts.api)

    // 驗證更新後的資訊
    const table = findTable(page)
    const updatedRow = findTableRow(table, `${originalName} (已編輯)`)
    await expect(updatedRow).toBeVisible()
  })

  test('應該能夠按分店過濾員工', async ({ page }) => {
    // 找到分店過濾下拉選單
    const branchFilter = findSelect(page, { name: 'branch_filter' }).or(
      page.locator('select').filter({ hasText: /分店|所有分店|Branch/ })
    )

    if (await branchFilter.isVisible()) {
      // 使用過濾輔助工具
      await waitForFilterResults(
        page,
        async () => {
          await branchFilter.selectOption({ index: 1 })
        },
        'tbody tr, [role="row"]',
        TestEnv.timeouts.api
      )

      // 驗證結果已過濾
      const resultCount = await page.locator('tbody tr, [role="row"]').count()
      expect(resultCount).toBeGreaterThan(0)
    }
  })

  test('應該能夠按職位過濾員工', async ({ page }) => {
    // 找到職位過濾下拉選單
    const jobTitleFilter = findSelect(page, { name: 'job_title_filter' }).or(
      page.locator('select').filter({ hasText: /職位|所有職位|Job Title/ })
    )

    if (await jobTitleFilter.isVisible()) {
      // 使用過濾輔助工具
      await waitForFilterResults(
        page,
        async () => {
          await jobTitleFilter.selectOption({ index: 1 })
        },
        'tbody tr, [role="row"]',
        TestEnv.timeouts.api
      )

      // 驗證結果已過濾
      const resultCount = await page.locator('tbody tr, [role="row"]').count()
      expect(resultCount).toBeGreaterThan(0)
    }
  })

  test('應該能夠查看員工詳細資訊', async ({ page }) => {
    // 點擊第一個員工的查看/詳情按鈕
    const firstViewButton = findButton(page, { text: BilingualSelectors.view }).first()

    if (await firstViewButton.isVisible()) {
      await firstViewButton.click()

      // 等待詳情頁面或彈窗出現（不使用硬編碼等待）
      const detailView = page.locator('.employee-detail, [role="dialog"]')
      await expect(detailView).toBeVisible({ timeout: TestEnv.timeouts.default })

      // 驗證包含關鍵資訊
      await expect(detailView).toContainText(/姓名|員工編號|職位|分店|Name|Employee/)
    }
  })
})
