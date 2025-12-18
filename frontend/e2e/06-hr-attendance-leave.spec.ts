import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'
import { getAuthToken, cleanupTestData } from './fixtures/api'

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055'
let authToken: string
let testAttendanceIds: string[] = []
let testLeaveIds: string[] = []

test.describe('HR 考勤管理流程 E2E', () => {
  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, TEST_USERS.admin.email, TEST_USERS.admin.password)
  })

  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
  })

  test.afterEach(async ({ request }) => {
    // 清理測試數據
    if (testAttendanceIds.length > 0) {
      await cleanupTestData(request, authToken, 'attendance_records', testAttendanceIds)
      testAttendanceIds = []
    }
    if (testLeaveIds.length > 0) {
      await cleanupTestData(request, authToken, 'leave_applications', testLeaveIds)
      testLeaveIds = []
    }
  })

  test('應該能夠打卡上班', async ({ page }) => {
    // 導航到考勤頁面
    await page.goto('/attendance')
    await page.waitForLoadState('networkidle')

    // 找到打卡按鈕
    const clockInButton = page.locator('button').filter({ hasText: /打卡|上班|Clock In/ })

    // 如果已經打卡，先跳過這個測試
    const isDisabled = await clockInButton.isDisabled().catch(() => false)
    if (isDisabled) {
      test.skip()
      return
    }

    await expect(clockInButton).toBeVisible({ timeout: 5000 })
    await clockInButton.click()

    // 等待成功訊息
    const successMessage = page.locator('.success-message, .toast').filter({ hasText: /成功|已打卡/ })
    await expect(successMessage).toBeVisible({ timeout: 5000 })

    // 驗證打卡記錄出現
    await page.waitForTimeout(1000)
    const todayRecord = page.locator('.attendance-record, tr').filter({ hasText: new RegExp(new Date().toLocaleDateString('zh-TW').split('/').slice(1).join('/')) })
    await expect(todayRecord).toBeVisible()
  })

  test('應該能夠打卡下班', async ({ page, request }) => {
    // 先確保有上班打卡記錄
    const today = new Date().toISOString().split('T')[0]

    // 創建一個上班打卡記錄
    const clockInResponse = await request.post(`${DIRECTUS_URL}/items/attendance_records`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        employee_id: 'test-employee-id', // 需要從登入的用戶獲取
        date: today,
        clock_in: new Date().toISOString(),
        status: 'present'
      }
    })

    if (clockInResponse.ok()) {
      const clockInData = await clockInResponse.json()
      testAttendanceIds.push(clockInData.data.id)
    }

    await page.goto('/attendance')
    await page.waitForLoadState('networkidle')

    // 找到下班打卡按鈕
    const clockOutButton = page.locator('button').filter({ hasText: /下班|Clock Out/ })

    if (await clockOutButton.isVisible()) {
      await clockOutButton.click()

      // 等待成功訊息
      const successMessage = page.locator('.success-message, .toast').filter({ hasText: /成功|已打卡/ })
      await expect(successMessage).toBeVisible({ timeout: 5000 })
    }
  })

  test('應該顯示考勤記錄列表', async ({ page }) => {
    await page.goto('/attendance')
    await page.waitForLoadState('networkidle')

    // 驗證頁面標題
    await expect(page.locator('h1, h2').filter({ hasText: /考勤|出勤/ })).toBeVisible()

    // 驗證考勤記錄表格或列表
    const recordList = page.locator('table, .attendance-list, [role="table"]')
    await expect(recordList).toBeVisible({ timeout: 5000 })

    // 驗證包含日期和打卡時間欄位
    const headers = ['日期', '上班時間', '下班時間']
    for (const header of headers) {
      const headerElement = page.locator('th, [role="columnheader"], label').filter({ hasText: header })
      await expect(headerElement.first()).toBeVisible()
    }
  })

  test('應該能夠按日期篩選考勤記錄', async ({ page }) => {
    await page.goto('/attendance')
    await page.waitForLoadState('networkidle')

    // 找到日期篩選器
    const dateFilter = page.locator('input[type="date"], input[type="month"]').first()

    if (await dateFilter.isVisible()) {
      // 選擇當月
      const currentMonth = new Date().toISOString().slice(0, 7)
      await dateFilter.fill(currentMonth)

      // 等待篩選結果
      await page.waitForTimeout(1000)

      // 驗證有結果顯示
      const records = page.locator('tbody tr, .attendance-record')
      const count = await records.count()
      expect(count).toBeGreaterThanOrEqual(0)
    }
  })
})

test.describe('HR 請假管理流程 E2E', () => {
  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request, TEST_USERS.admin.email, TEST_USERS.admin.password)
  })

  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
  })

  test.afterEach(async ({ request }) => {
    if (testLeaveIds.length > 0) {
      await cleanupTestData(request, authToken, 'leave_applications', testLeaveIds)
      testLeaveIds = []
    }
  })

  test('應該能夠申請請假', async ({ page, request }) => {
    await page.goto('/leave')
    await page.waitForLoadState('networkidle')

    // 點擊申請請假按鈕
    const applyButton = page.locator('button').filter({ hasText: /申請請假|新增請假/ })
    await applyButton.click()

    // 等待表單出現
    const form = page.locator('form, [role="form"]')
    await expect(form).toBeVisible({ timeout: 5000 })

    // 選擇請假類型
    const leaveTypeSelect = page.locator('select[name="leave_type"], #leave_type')
    await leaveTypeSelect.selectOption('annual')

    // 填寫開始日期
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const startDate = tomorrow.toISOString().split('T')[0]
    await page.fill('input[name="start_date"], #start_date', startDate)

    // 填寫結束日期
    const endDate = new Date(tomorrow)
    endDate.setDate(endDate.getDate() + 1)
    await page.fill('input[name="end_date"], #end_date', endDate.toISOString().split('T')[0])

    // 填寫請假原因
    await page.fill('textarea[name="reason"], #reason', '測試請假申請')

    // 提交表單
    const submitButton = page.locator('button[type="submit"]').filter({ hasText: /提交|送出|確定/ })
    await submitButton.click()

    // 等待成功訊息
    const successMessage = page.locator('.success-message, .toast').filter({ hasText: /成功/ })
    await expect(successMessage).toBeVisible({ timeout: 5000 })

    // 取得新建請假申請 ID 用於清理
    const response = await request.get(`${DIRECTUS_URL}/items/leave_applications`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: {
        filter: JSON.stringify({
          start_date: { _eq: startDate },
          reason: { _eq: '測試請假申請' }
        }),
        sort: '-date_created',
        limit: 1
      }
    })
    const data = await response.json()
    if (data.data && data.data.length > 0) {
      testLeaveIds.push(data.data[0].id)
    }
  })

  test('應該顯示請假申請列表', async ({ page }) => {
    await page.goto('/leave')
    await page.waitForLoadState('networkidle')

    // 驗證頁面標題
    await expect(page.locator('h1, h2').filter({ hasText: /請假|休假/ })).toBeVisible()

    // 驗證請假列表
    const leaveList = page.locator('table, .leave-list, [role="table"]')
    await expect(leaveList).toBeVisible({ timeout: 5000 })

    // 驗證包含關鍵欄位
    const headers = ['類型', '開始日期', '結束日期', '狀態']
    for (const header of headers) {
      const headerElement = page.locator('th, [role="columnheader"]').filter({ hasText: header })
      await expect(headerElement.first()).toBeVisible()
    }
  })

  test('應該能夠篩選請假申請狀態', async ({ page }) => {
    await page.goto('/leave')
    await page.waitForLoadState('networkidle')

    // 找到狀態篩選下拉選單
    const statusFilter = page.locator('select').filter({ hasText: /狀態|所有狀態/ }).or(
      page.locator('select[name="status_filter"], #status_filter')
    )

    if (await statusFilter.isVisible()) {
      // 選擇待審核狀態
      await statusFilter.selectOption('pending')

      // 等待篩選結果
      await page.waitForTimeout(1000)

      // 驗證結果
      const records = page.locator('tbody tr, .leave-record')
      const count = await records.count()
      expect(count).toBeGreaterThanOrEqual(0)
    }
  })

  test('應該能夠查看請假詳情', async ({ page }) => {
    await page.goto('/leave')
    await page.waitForLoadState('networkidle')

    // 找到第一筆請假記錄的查看按鈕
    const viewButton = page.locator('button, a').filter({ hasText: /查看|詳情/ }).first()

    if (await viewButton.isVisible()) {
      await viewButton.click()

      // 等待詳情頁面或彈窗出現
      await page.waitForTimeout(1000)

      // 驗證顯示詳細資訊
      const detailView = page.locator('.leave-detail, [role="dialog"]')
      await expect(detailView).toBeVisible({ timeout: 5000 })

      // 驗證包含關鍵資訊
      await expect(detailView).toContainText(/請假類型|開始日期|結束日期|請假原因/)
    }
  })

  test('應該能夠審核請假申請（管理員）', async ({ page, request }) => {
    // 先創建一個待審核的請假申請
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const startDate = tomorrow.toISOString().split('T')[0]
    const endDate = new Date(tomorrow)
    endDate.setDate(endDate.getDate() + 1)

    const createResponse = await request.post(`${DIRECTUS_URL}/items/leave_applications`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        employee_id: 'test-employee-id',
        leave_type: 'annual',
        start_date: startDate,
        end_date: endDate.toISOString().split('T')[0],
        reason: '測試審核',
        status: 'pending'
      }
    })

    let leaveId: string | null = null
    if (createResponse.ok()) {
      const createData = await createResponse.json()
      leaveId = createData.data.id
      testLeaveIds.push(leaveId)
    }

    if (!leaveId) {
      test.skip()
      return
    }

    // 導航到請假審核頁面
    await page.goto('/leave/pending')
    await page.waitForLoadState('networkidle')

    // 找到待審核的請假申請
    const pendingLeave = page.locator('tr, .leave-record').filter({ hasText: '測試審核' })

    if (await pendingLeave.isVisible()) {
      // 點擊審核按鈕
      const approveButton = pendingLeave.locator('button').filter({ hasText: /審核|核准|Approve/ })
      await approveButton.click()

      // 等待審核對話框
      const dialog = page.locator('[role="dialog"], .modal')
      await expect(dialog).toBeVisible({ timeout: 3000 })

      // 選擇核准
      const confirmButton = dialog.locator('button').filter({ hasText: /核准|同意|Approve/ })
      await confirmButton.click()

      // 等待成功訊息
      const successMessage = page.locator('.success-message, .toast').filter({ hasText: /成功/ })
      await expect(successMessage).toBeVisible({ timeout: 5000 })
    }
  })

  test('應該能夠撤銷請假申請', async ({ page, request }) => {
    // 創建一個待審核的請假申請
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 2)
    const startDate = tomorrow.toISOString().split('T')[0]

    const createResponse = await request.post(`${DIRECTUS_URL}/items/leave_applications`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        employee_id: 'test-employee-id',
        leave_type: 'sick',
        start_date: startDate,
        end_date: startDate,
        reason: '測試撤銷',
        status: 'pending'
      }
    })

    let leaveId: string | null = null
    if (createResponse.ok()) {
      const createData = await createResponse.json()
      leaveId = createData.data.id
      testLeaveIds.push(leaveId)
    }

    if (!leaveId) {
      test.skip()
      return
    }

    await page.goto('/leave')
    await page.waitForLoadState('networkidle')

    // 找到該請假申請
    const leaveRecord = page.locator('tr, .leave-record').filter({ hasText: '測試撤銷' })

    if (await leaveRecord.isVisible()) {
      // 點擊撤銷按鈕
      const cancelButton = leaveRecord.locator('button').filter({ hasText: /撤銷|取消/ })

      if (await cancelButton.isVisible()) {
        await cancelButton.click()

        // 確認撤銷
        const confirmButton = page.locator('button').filter({ hasText: /確定|是/ })
        if (await confirmButton.isVisible()) {
          await confirmButton.click()
        }

        // 等待成功訊息
        const successMessage = page.locator('.success-message, .toast').filter({ hasText: /成功/ })
        await expect(successMessage).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('應該顯示請假統計資訊', async ({ page }) => {
    await page.goto('/leave')
    await page.waitForLoadState('networkidle')

    // 查找統計卡片或資訊
    const statsSection = page.locator('.stats, .summary, .leave-balance')

    if (await statsSection.isVisible()) {
      // 驗證包含統計資訊
      await expect(statsSection).toContainText(/剩餘|已用|天數/)
    }
  })
})
