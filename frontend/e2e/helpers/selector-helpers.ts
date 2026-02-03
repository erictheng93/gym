import { Page, Locator } from '@playwright/test'

/**
 * 選擇器輔助工具
 * 提供更穩定的元素選擇策略，減少對文本內容的依賴
 */

/**
 * 測試 ID 前綴
 */
export const TEST_ID_PREFIX = 'data-testid'

/**
 * 常用的測試 ID
 */
export const TEST_IDS = {
  // 通用
  searchInput: 'search-input',
  addButton: 'add-button',
  editButton: 'edit-button',
  deleteButton: 'delete-button',
  viewButton: 'view-button',
  submitButton: 'submit-button',
  cancelButton: 'cancel-button',
  confirmButton: 'confirm-button',
  closeButton: 'close-button',

  // 表格
  table: 'data-table',
  tableRow: 'table-row',
  tableHeader: 'table-header',

  // 表單
  form: 'form',
  formField: 'form-field',

  // 員工管理
  employeeList: 'employee-list',
  employeeForm: 'employee-form',
  employeeName: 'employee-name',
  employeeCode: 'employee-code',
  employeeEmail: 'employee-email',
  employeePhone: 'employee-phone',
  employeeBranch: 'employee-branch',
  employeeJobTitle: 'employee-job-title',
  employeeStatus: 'employee-status',

  // 考勤管理
  attendanceList: 'attendance-list',
  clockInButton: 'clock-in-button',
  clockOutButton: 'clock-out-button',
  attendanceRecord: 'attendance-record',

  // 請假管理
  leaveList: 'leave-list',
  leaveForm: 'leave-form',
  leaveType: 'leave-type',
  leaveStartDate: 'leave-start-date',
  leaveEndDate: 'leave-end-date',
  leaveReason: 'leave-reason',
  leaveStatus: 'leave-status',

  // 分店管理
  branchFilter: 'branch-filter',
  branchSelect: 'branch-select',
  branchList: 'branch-list',

  // 訊息提示
  successMessage: 'success-message',
  errorMessage: 'error-message',
  toast: 'toast',

  // 對話框
  dialog: 'dialog',
  modal: 'modal',
} as const

/**
 * 通過 data-testid 獲取元素
 * @param page Page 實例
 * @param testId 測試 ID
 */
export function getByTestId(page: Page, testId: string): Locator {
  return page.locator(`[data-testid="${testId}"]`)
}

/**
 * 通過多種策略查找按鈕（優先使用 testId，其次使用 role 和文本）
 * @param page Page 實例
 * @param options 選項
 */
export function findButton(
  page: Page,
  options: {
    testId?: string
    text?: string | RegExp
    name?: string
  }
): Locator {
  if (options.testId) {
    return getByTestId(page, options.testId)
  }

  if (options.name) {
    return page.getByRole('button', { name: options.name })
  }

  if (options.text) {
    return page.locator('button, [role="button"]').filter({ hasText: options.text })
  }

  throw new Error('Must provide testId, name, or text option')
}

/**
 * 通過多種策略查找輸入框
 * @param page Page 實例或 Locator
 * @param options 選項
 */
export function findInput(
  pageOrLocator: Page | Locator,
  options: {
    testId?: string
    name?: string
    placeholder?: string | RegExp
    type?: string
    label?: string | RegExp
  }
): Locator {
  const page = 'locator' in pageOrLocator ? pageOrLocator : pageOrLocator

  if (options.testId) {
    return page.locator(`[data-testid="${options.testId}"]`)
  }

  if (options.label) {
    // 通過 label 查找輸入框 - 使用 CSS 選擇器策略
    const label = page.locator('label').filter({ hasText: options.label })
    // 優先查找 label 內的 input，或通過 for 屬性關聯的 input
    return label.locator('input')
  }

  let selector = 'input'

  if (options.type) {
    selector += `[type="${options.type}"]`
  }

  if (options.name) {
    selector += `[name="${options.name}"]`
  }

  const locator = page.locator(selector)

  if (options.placeholder) {
    return locator.filter({ hasText: options.placeholder })
  }

  return locator
}

/**
 * 通過多種策略查找下拉選單
 * @param page Page 實例或 Locator
 * @param options 選項
 */
export function findSelect(
  pageOrLocator: Page | Locator,
  options: {
    testId?: string
    name?: string
    label?: string | RegExp
  }
): Locator {
  const page = 'locator' in pageOrLocator ? pageOrLocator : pageOrLocator

  if (options.testId) {
    return page.locator(`[data-testid="${options.testId}"]`)
  }

  if (options.label) {
    // 通過 label 查找 select - 使用 CSS 選擇器策略
    const label = page.locator('label').filter({ hasText: options.label })
    // 優先查找 label 內的 select，或通過 for 屬性關聯的 select
    return label.locator('select')
  }

  if (options.name) {
    return page.locator(`select[name="${options.name}"]`)
  }

  return page.locator('select')
}

/**
 * 通過多種策略查找表格
 * @param page Page 實例
 * @param options 選項
 */
export function findTable(
  page: Page,
  options: {
    testId?: string
    role?: boolean
  } = {}
): Locator {
  if (options.testId) {
    return getByTestId(page, options.testId)
  }

  if (options.role !== false) {
    return page.locator('table, [role="table"]')
  }

  return page.locator('table')
}

/**
 * 查找表格中的某一行
 * @param table 表格 Locator
 * @param rowIdentifier 行識別信息（可以是索引或包含的文本）
 */
export function findTableRow(
  table: Locator,
  rowIdentifier: number | string | RegExp
): Locator {
  const rows = table.locator('tbody tr, [role="row"]')

  if (typeof rowIdentifier === 'number') {
    return rows.nth(rowIdentifier)
  }

  return rows.filter({ hasText: rowIdentifier })
}

/**
 * 查找表格中的某個單元格
 * @param row 行 Locator
 * @param columnIndexOrName 列索引或列名
 */
export function findTableCell(
  row: Locator,
  columnIndexOrName: number | string
): Locator {
  if (typeof columnIndexOrName === 'number') {
    return row.locator('td, [role="cell"]').nth(columnIndexOrName)
  }

  // 通過列名查找（需要先找到對應的列索引）
  return row.locator('td, [role="cell"]')
}

/**
 * 查找成功訊息
 * @param page Page 實例
 * @param text 可選的文本內容
 */
export function findSuccessMessage(
  page: Page,
  text?: string | RegExp
): Locator {
  let locator = page.locator(
    '[data-testid="success-message"], [data-testid="toast"], .success-message, .toast, .notification, [role="alert"]'
  ).filter({ hasText: /成功|Success|已|完成/ })

  if (text) {
    locator = locator.filter({ hasText: text })
  }

  return locator
}

/**
 * 查找錯誤訊息
 * @param page Page 實例
 * @param text 可選的文本內容
 */
export function findErrorMessage(
  page: Page,
  text?: string | RegExp
): Locator {
  let locator = page.locator(
    '[data-testid="error-message"], [data-testid="toast"], .error-message, .toast, .notification, [role="alert"]'
  ).filter({ hasText: /錯誤|失敗|Error|Failed/ })

  if (text) {
    locator = locator.filter({ hasText: text })
  }

  return locator
}

/**
 * 查找對話框
 * @param page Page 實例
 * @param options 選項
 */
export function findDialog(
  page: Page,
  options: {
    testId?: string
    title?: string | RegExp
  } = {}
): Locator {
  if (options.testId) {
    return getByTestId(page, options.testId)
  }

  let locator = page.locator('[role="dialog"], .modal, .dialog, [data-testid="dialog"], [data-testid="modal"]')

  if (options.title) {
    locator = locator.filter({ hasText: options.title })
  }

  return locator
}

/**
 * 查找頁面標題
 * @param page Page 實例
 * @param titlePattern 標題文本模式（可選）
 */
export function findPageTitle(
  page: Page,
  titlePattern?: string | RegExp
): Locator {
  let locator = page.locator('h1, h2, [data-testid="page-title"]')

  if (titlePattern) {
    locator = locator.filter({ hasText: titlePattern })
  }

  return locator
}

/**
 * 查找分頁控件
 * @param page Page 實例
 */
export function findPagination(page: Page): {
  container: Locator
  nextButton: Locator
  prevButton: Locator
  currentPage: Locator
} {
  const container = page.locator('.pagination, [role="navigation"]').filter({
    has: page.locator('button, a')
  })

  return {
    container,
    nextButton: container.locator('button, a').filter({
      hasText: /下一頁|Next|>|›/
    }),
    prevButton: container.locator('button, a').filter({
      hasText: /上一頁|Previous|<|‹/
    }),
    currentPage: container.locator('.active, [aria-current]')
  }
}

/**
 * 通用表單欄位查找器
 * @param form 表單 Locator
 * @param fieldName 欄位名稱
 */
export function findFormField(
  form: Locator,
  fieldName: string
): Locator {
  // 優先使用 name 屬性
  let field = form.locator(`[name="${fieldName}"]`)

  // 如果沒有找到，嘗試使用 id
  if (field) {
    return field
  }

  field = form.locator(`#${fieldName}`)
  if (field) {
    return field
  }

  // 最後嘗試使用 data-testid
  return form.locator(`[data-testid="${fieldName}"]`)
}

/**
 * 語言無關的文本匹配
 * 提供中英文雙語支持的選擇器
 */
export const BilingualSelectors = {
  // 按鈕文本
  add: /新增|Add|Create/i,
  edit: /編輯|Edit|Modify/i,
  delete: /刪除|Delete|Remove/i,
  view: /查看|詳情|View|Detail/i,
  submit: /提交|送出|儲存|Submit|Save/i,
  cancel: /取消|Cancel/i,
  confirm: /確認|確定|Confirm|OK/i,
  close: /關閉|Close/i,
  search: /搜尋|Search/i,
  filter: /篩選|過濾|Filter/i,
  reset: /重置|清空|Reset|Clear/i,

  // 操作
  approve: /核准|批准|同意|Approve/i,
  reject: /拒絕|駁回|Reject/i,
  clockIn: /打卡|上班|Clock In/i,
  clockOut: /下班|Clock Out/i,

  // 狀態
  success: /成功|Success|完成|Complete/i,
  error: /錯誤|失敗|Error|Failed/i,
  pending: /待審核|待處理|Pending/i,
  active: /啟用|激活|Active/i,
  inactive: /停用|Inactive/i,

  // 頁面元素
  allBranches: /所有分店|全部分店|All Branches/i,
  allStatuses: /所有狀態|全部狀態|All Statuses/i,
}
