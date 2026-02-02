/**
 * Application Constants
 * 集中管理應用程式的常數，避免硬編碼
 */

// ============================================
// App Info
// ============================================
export const APP_NAME = 'Gym Nexus'
export const APP_DESCRIPTION = '智慧健身房管理系統'
export const APP_COPYRIGHT_YEAR = new Date().getFullYear()

// ============================================
// Storage Keys (localStorage / sessionStorage)
// ============================================
export const STORAGE_KEYS = {
  THEME: 'gym-nexus-theme',
  AUTH_TOKEN: 'gym-nexus-auth-token',
  USER_PREFERENCES: 'gym-nexus-user-prefs',
} as const

// ============================================
// Animation & Timing (ms)
// ============================================
export const TIMING = {
  SHAKE_DURATION: 500,
  TOAST_DURATION: 3000,
  DEBOUNCE: 300,
  TRANSITION_FAST: 150,
  TRANSITION_NORMAL: 300,
  TRANSITION_SLOW: 500,
} as const

// ============================================
// Pagination
// ============================================
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
} as const

// ============================================
// Date/Time Formats
// ============================================
export const DATE_FORMAT = {
  DATE: 'YYYY-MM-DD',
  DATETIME: 'YYYY-MM-DD HH:mm',
  TIME: 'HH:mm',
  DISPLAY_DATE: 'YYYY年MM月DD日',
  DISPLAY_DATETIME: 'YYYY年MM月DD日 HH:mm',
} as const

// ============================================
// Status Labels
// ============================================
export const STATUS = {
  // Contract Status
  CONTRACT: {
    ACTIVE: '有效',
    EXPIRED: '過期',
    PAUSED: '暫停',
    DRAFT: '草稿',
    TERMINATED: '終止',
  },
  // Member Status
  MEMBER: {
    ACTIVE: '有效',
    EXPIRED: '過期',
    SUSPENDED: '停權',
    PAUSED: '暫停',
  },
  // Payment Status
  PAYMENT: {
    PAID: '已付款',
    UNPAID: '未付款',
    PARTIAL: '部分付款',
    REFUNDED: '已退款',
  },
  // General
  ENABLED: '啟用',
  DISABLED: '停用',
  OPERATING: '營運中',
} as const

// ============================================
// Labels & Mappings
// ============================================
export const LABELS = {
  // Gender
  GENDER: {
    MALE: '男',
    FEMALE: '女',
    OTHER: '其他',
  },
  // Branch Type
  BRANCH_TYPE: {
    HEADQUARTER: '總店',
    BRANCH: '分店',
  },
  // Contract Type
  CONTRACT_TYPE: {
    TIME_BASED: '期限制',
    COUNT_BASED: '計次制',
  },
  // Payment Type
  PAYMENT_TYPE: {
    INCOME: '收款',
    REFUND: '退款',
  },
  // Payment Method
  PAYMENT_METHOD: {
    CASH: '現金',
    CREDIT_CARD: '信用卡',
    LINE_PAY: 'LINE Pay',
    BANK_TRANSFER: '匯款',
  },
  // Contract Log Type
  LOG_TYPE: {
    PAUSE: '暫停',
    RESUME: '恢復',
    EXTENSION: '延期',
    TRANSFER: '轉讓',
    CANCEL: '終止',
    RENEWAL: '續約',
    CLASS_USED: '扣堂',
  },
  // Transfer
  TRANSFERABLE: '可轉讓',
  NON_TRANSFERABLE: '不可轉讓',
  PAUSABLE: '可暫停',
  NON_PAUSABLE: '不可暫停',
  // Boolean
  YES: '是',
  NO: '否',
} as const

// ============================================
// UI Messages - 繁體中文
// ============================================
export const MESSAGES = {
  // Auth
  AUTH: {
    LOGIN: '登入',
    LOGOUT: '登出',
    LOGGING_IN: '登入中...',
    LOGIN_SUBTITLE: '登入您的帳號以繼續',
    LOGIN_ERROR: '登入失敗，請確認帳號密碼',
    REQUIRED_FIELDS: '請填寫帳號和密碼',
    SESSION_EXPIRED: '登入已過期，請重新登入',
  },

  // Form Labels
  FORM: {
    EMAIL: '電子郵件',
    EMAIL_PLACEHOLDER: 'name@example.com',
    PASSWORD: '密碼',
    PASSWORD_PLACEHOLDER: '輸入您的密碼',
    SUBMIT: '送出',
    CANCEL: '取消',
    SAVE: '儲存',
    SAVE_CHANGES: '儲存變更',
    DELETE: '刪除',
    EDIT: '編輯',
    ADD: '新增',
    CREATE: '建立',
    SEARCH: '搜尋',
    SEARCH_PLACEHOLDER: '搜尋...',
    NAME: '姓名',
    PHONE: '電話',
    ADDRESS: '地址',
    BIRTHDAY: '生日',
    GENDER: '性別',
    NOTES: '備註',
    TAGS: '標籤',
    REASON: '原因',
  },

  // Common Actions
  ACTIONS: {
    CONFIRM: '確認',
    BACK: '返回',
    NEXT: '下一步',
    PREVIOUS: '上一步',
    REFRESH: '重新整理',
    LOADING: '載入中...',
    PROCESSING: '處理中...',
    CREATING: '建立中...',
    UPDATING: '更新中...',
    DELETING: '刪除中...',
    VIEW_ALL: '查看全部',
    VIEW_DETAILS: '查看詳情',
    NO_DATA: '暫無資料',
    SELECT: '選擇',
    EXPORT: '匯出',
    PREV_PAGE: '上一頁',
    NEXT_PAGE: '下一頁',
  },

  // Accessibility
  A11Y: {
    TOGGLE_THEME: '切換主題',
    CLOSE_MODAL: '關閉視窗',
    OPEN_MENU: '開啟選單',
    CLOSE_MENU: '關閉選單',
  },

  // Errors
  ERRORS: {
    // Generic
    GENERIC: '發生錯誤，請稍後再試',
    NETWORK: '網路連線錯誤',
    NOT_FOUND: '找不到資料',
    UNAUTHORIZED: '權限不足',
    SERVER: '伺服器錯誤',
    REQUIRED_NAME: '請輸入姓名',

    // Member
    MEMBER_CREATE_FAILED: '建立會員失敗，請檢查輸入資料',
    MEMBER_UPDATE_FAILED: '更新會員資料失敗，請稍後再試',
    MEMBER_DELETE_FAILED: '刪除會員失敗，該會員可能有關聯的合約',
    MEMBER_FETCH_FAILED: '載入會員資料失敗，請稍後再試',
    MEMBER_SEARCH_FAILED: '搜尋會員失敗，請稍後再試',
    MEMBER_LOAD_FAILED: '載入會員資料失敗，請稍後再試',

    // Contract
    CONTRACT_CREATE_FAILED: '建立合約失敗，請稍後再試',
    CONTRACT_UPDATE_FAILED: '更新合約失敗，請稍後再試',
    CONTRACT_DELETE_FAILED: '刪除合約失敗，請稍後再試',
    CONTRACT_FETCH_FAILED: '載入合約資料失敗，請稍後再試',
    CONTRACT_LOAD_FAILED: '載入合約資料失敗，請稍後再試',
    CONTRACT_PAUSE_FAILED: '暫停合約失敗，請稍後再試',
    CONTRACT_RESUME_FAILED: '恢復合約失敗，請稍後再試',
    CONTRACT_TRANSFER_FAILED: '轉讓合約失敗，請稍後再試',
    CONTRACT_TERMINATE_FAILED: '終止合約失敗，請稍後再試',
    CONTRACT_EXTEND_FAILED: '延期合約失敗，請稍後再試',
    CONTRACT_RENEW_FAILED: '續約合約失敗，請稍後再試',

    // Payment
    PAYMENT_CREATE_FAILED: '建立付款紀錄失敗，請稍後再試',
    PAYMENT_UPDATE_FAILED: '更新付款紀錄失敗，請稍後再試',
    PAYMENT_DELETE_FAILED: '刪除付款紀錄失敗，請稍後再試',
    PAYMENT_FETCH_FAILED: '載入付款紀錄失敗，請稍後再試',

    // Plan
    PLAN_CREATE_FAILED: '建立方案失敗，請稍後再試',
    PLAN_UPDATE_FAILED: '更新方案失敗，請稍後再試',
    PLAN_DELETE_FAILED: '刪除方案失敗，請稍後再試',
    PLAN_FETCH_FAILED: '載入方案資料失敗，請稍後再試',

    // Employee
    EMPLOYEE_CREATE_FAILED: '建立員工失敗，請稍後再試',
    EMPLOYEE_UPDATE_FAILED: '更新員工資料失敗，請稍後再試',
    EMPLOYEE_DELETE_FAILED: '刪除員工失敗，請稍後再試',
    EMPLOYEE_FETCH_FAILED: '載入員工資料失敗，請稍後再試',

    // Branch
    BRANCH_CREATE_FAILED: '建立分店失敗，請稍後再試',
    BRANCH_UPDATE_FAILED: '更新分店資料失敗，請稍後再試',
    BRANCH_DELETE_FAILED: '刪除分店失敗，請稍後再試',
    BRANCH_FETCH_FAILED: '載入分店資料失敗，請稍後再試',
    BRANCH_LOAD_FAILED: '載入分店資料失敗，請稍後再試',
    BRANCH_UPDATE_STATUS_FAILED: '更新分店狀態失敗，請稍後再試',

    // Job Title
    JOB_TITLE_CREATE_FAILED: '建立職位失敗，請稍後再試',
    JOB_TITLE_UPDATE_FAILED: '更新職位資料失敗，請稍後再試',
    JOB_TITLE_DELETE_FAILED: '刪除職位失敗，請稍後再試',
    JOB_TITLE_FETCH_FAILED: '載入職位資料失敗，請稍後再試',

    // HR
    ATTENDANCE_FETCH_FAILED: '載入考勤資料失敗，請稍後再試',
    LEAVE_CREATE_FAILED: '建立休假申請失敗，請稍後再試',
    LEAVE_UPDATE_FAILED: '更新休假申請失敗，請稍後再試',
    LEAVE_CANCEL_FAILED: '取消休假申請失敗，請稍後再試',
    LEAVE_REVIEW_FAILED: '審核休假申請失敗，請稍後再試',
    MAKEUP_CREATE_FAILED: '建立補打卡申請失敗，請稍後再試',
    MAKEUP_CANCEL_FAILED: '取消補打卡申請失敗，請稍後再試',
    MAKEUP_REVIEW_FAILED: '審核補打卡申請失敗，請稍後再試',
    SCHEDULE_CREATE_FAILED: '建立班表失敗，請稍後再試',
    SCHEDULE_UPDATE_FAILED: '更新班表失敗，請稍後再試',
    SCHEDULE_DELETE_FAILED: '刪除班表失敗，請稍後再試',
    SCHEDULE_ASSIGN_FAILED: '指派班表失敗，請稍後再試',

    // Checkin
    CHECKIN: '入場登記失敗，請稍後再試',
    CHECKIN_VERIFY_FAILED: '驗證失敗，請稍後再試',

    // Report
    REPORT_FETCH_FAILED: '載入報表資料失敗，請稍後再試',
    REPORT_EXPORT_FAILED: '匯出報表失敗，請稍後再試',

    // Class Category
    CATEGORY_CREATE_FAILED: '建立課程類別失敗，請稍後再試',
    CATEGORY_UPDATE_FAILED: '更新課程類別失敗，請稍後再試',
    CATEGORY_DELETE_FAILED: '刪除課程類別失敗，請稍後再試',
    CATEGORY_FETCH_FAILED: '載入課程類別失敗，請稍後再試',

    // Dashboard
    DASHBOARD_LOAD_FAILED: '載入儀表板資料失敗',
  },

  // Success
  SUCCESS: {
    // Generic
    SAVED: '儲存成功',
    DELETED: '刪除成功',
    UPDATED: '更新成功',
    CREATED: '建立成功',

    // Member
    MEMBER_CREATED: '會員建立成功',
    MEMBER_UPDATED: '會員資料更新成功',
    MEMBER_DELETED: '會員刪除成功',

    // Contract
    CONTRACT_CREATED: '合約建立成功',
    CONTRACT_UPDATED: '合約更新成功',
    CONTRACT_DELETED: '合約刪除成功',
    CONTRACT_PAUSED: '合約已暫停',
    CONTRACT_RESUMED: '合約已恢復',
    CONTRACT_TRANSFERRED: '合約轉讓成功',
    CONTRACT_TERMINATED: '合約已終止',
    CONTRACT_EXTENDED: '合約延期成功',
    CONTRACT_RENEWED: '合約續約成功',

    // Payment
    PAYMENT_CREATED: '付款紀錄建立成功',
    PAYMENT_UPDATED: '付款紀錄更新成功',
    PAYMENT_DELETED: '付款紀錄刪除成功',

    // Plan
    PLAN_CREATED: '方案建立成功',
    PLAN_UPDATED: '方案更新成功',
    PLAN_DELETED: '方案刪除成功',

    // Employee
    EMPLOYEE_CREATED: '員工建立成功',
    EMPLOYEE_UPDATED: '員工資料更新成功',
    EMPLOYEE_DELETED: '員工刪除成功',

    // Branch
    BRANCH_CREATED: '分店建立成功',
    BRANCH_UPDATED: '分店資料更新成功',
    BRANCH_DELETED: '分店刪除成功',
    BRANCH_ACTIVATED: '分店已啟用',
    BRANCH_ARCHIVED: '分店已停用',

    // Job Title
    JOB_TITLE_CREATED: '職位建立成功',
    JOB_TITLE_UPDATED: '職位資料更新成功',
    JOB_TITLE_DELETED: '職位刪除成功',

    // HR
    LEAVE_CREATED: '休假申請已送出',
    LEAVE_CANCELLED: '休假申請已取消',
    LEAVE_APPROVED: '休假申請已核准',
    LEAVE_REJECTED: '休假申請已駁回',
    MAKEUP_CREATED: '補打卡申請已送出',
    MAKEUP_CANCELLED: '補打卡申請已取消',
    MAKEUP_APPROVED: '補打卡申請已核准',
    MAKEUP_REJECTED: '補打卡申請已駁回',
    SCHEDULE_CREATED: '班表建立成功',
    SCHEDULE_UPDATED: '班表更新成功',
    SCHEDULE_DELETED: '班表刪除成功',
    SCHEDULE_ASSIGNED: '班表指派成功',

    // Checkin
    CHECKIN: '入場成功!',

    // Report
    REPORT_EXPORTED: '報表匯出成功',

    // Class Category
    CATEGORY_CREATED: '課程類別建立成功',
    CATEGORY_UPDATED: '課程類別更新成功',
    CATEGORY_DELETED: '課程類別刪除成功',
  },

  // Navigation Menu
  NAV: {
    DASHBOARD: '儀表板',
    MEMBERS: '會員管理',
    CONTRACTS: '合約管理',
    PAYMENTS: '收款管理',
    PLANS: '會籍方案',
    EMPLOYEES: '員工管理',
    BRANCHES: '分店管理',
    CHECKIN: '會員入場',
    HR: '人資管理',
    REPORTS: '營運報表',
    CLASSES: '課程管理',
    CLASS_CATEGORIES: '課程類別',
  },

  // User
  USER: {
    DEFAULT_NAME: 'User',
    UNKNOWN: '未知用戶',
  },

  // Time Periods
  TIME: {
    TODAY: '今日',
    THIS_WEEK: '本週',
    THIS_MONTH: '本月',
    THIS_YEAR: '今年',
    ALL: '全部',
    RECENT_6_MONTHS: '近 6 個月',
  },

  // Greetings
  GREETING: {
    MORNING: '早安',
    AFTERNOON: '午安',
    EVENING: '晚安',
  },

  // Common Labels
  COMMON: {
    ALL_BRANCHES: '全部分店',
    ALL_STATUS: '全部狀態',
    MATCHES: '符合條件',
    BASIC_INFO: '基本資料',
    CONTACT_INFO: '聯絡資訊',
    PERSONAL_INFO: '個人資料',
  },

  // Confirmation
  CONFIRM: {
    DELETE_TITLE: '確定要刪除嗎？',
    DELETE_WARNING: '刪除後將無法恢復',
    CONFIRM_DELETE: '確定刪除',
  },
} as const

// ============================================
// Page-Specific Messages
// ============================================
export const PAGES = {
  // Dashboard
  DASHBOARD: {
    WELCOME: `歡迎回到 ${APP_NAME} 管理系統`,
    TOTAL_MEMBERS: '會員總數',
    NEW_THIS_WEEK: '本週新增',
    ACTIVE_MEMBERS: '有效會員',
    ACTIVE_RATE: '% 活躍率',
    ACTIVE_CONTRACTS: '有效合約',
    PENDING_SIGN: '待簽署',
    MONTHLY_REVENUE: '本月營收',
    RECENT_MEMBERS: '最新會員',
    RECENT_CONTRACTS: '最新合約',
    QUICK_ACTIONS: '快速操作',
    ADD_MEMBER: '新增會員',
    ADD_CONTRACT: '新增合約',
  },

  // Members
  MEMBERS: {
    TITLE: '會員管理',
    DESCRIPTION: '管理所有會員資料與狀態',
    ADD_MEMBER: '新增會員',
    EDIT_MEMBER: '編輯會員',
    NO_MEMBERS: '尚無會員資料',
    NO_MEMBERS_HINT: '新增第一位會員開始使用系統',
    SEARCH_PLACEHOLDER: '搜尋會員姓名、編號或電話...',
    VIEW_MEMBER: '查看會員',
    DELETE_WARNING: '刪除後將無法恢復會員資料',
    NAME_PLACEHOLDER: '請輸入會員姓名',
    CONTRACT_HISTORY: '合約紀錄',
    NO_CONTRACTS: '尚無合約紀錄',
    FILL_BASIC_INFO: '填寫會員基本資料',
    MODIFY_INFO: '修改會員資料',
  },

  // Contracts
  CONTRACTS: {
    TITLE: '合約管理',
    DESCRIPTION: '管理會員合約與簽約流程',
    ADD_CONTRACT: '新增合約',
    NO_CONTRACTS: '尚無合約資料',
    NO_CONTRACTS_HINT: '新增第一份合約開始使用系統',
    ACTIVE_CONTRACTS: '有效合約',
    EXPIRED_CONTRACTS: '已過期',
    DRAFT_CONTRACTS: '草稿',
    CONTRACT_NUMBER: '合約編號',
    MEMBER: '會員',
    PLAN: '方案',
    PERIOD: '期間',
    AMOUNT: '金額',
    CONTRACT_AMOUNT: '合約金額',
    PAYMENT_STATUS: '付款狀態',
    CONTRACT_STATUS: '合約狀態',
    START_DATE: '開始日期',
    END_DATE: '結束日期',
    // Contract Detail
    MEMBER_INFO: '會員資訊',
    PLAN_INFO: '方案資訊',
    CONTRACT_DETAILS: '合約詳情',
    E_SIGNATURE: '電子簽名',
    CHANGE_LOG: '合約異動紀錄',
    PAYMENT_RECORDS: '付款紀錄',
    ADD_PAYMENT: '新增收款',
    NO_PAYMENTS: '尚無付款紀錄',
    VIEW_MEMBER: '查看會員',
    // Plan Info Labels
    PLAN_TYPE: '方案類型',
    PLAN_DURATION: '方案期限',
    ALLOW_PAUSE: '允許暫停',
    ALLOW_TRANSFER: '允許轉讓',
    REMAINING_COUNTS: '剩餘次數',
    SIGN_DATE: '簽約日期',
    ORIGINAL_END_DATE: '原始結束日',
    BRANCH: '所屬分店',
    SALES_PERSON: '負責業務',
    // Log
    DAYS_AFFECTED: '影響天數',
    DAYS_UNIT: '天',
    // Actions
    PAUSE_CONTRACT: '暫停合約',
    RESUME_CONTRACT: '恢復合約',
    TRANSFER_CONTRACT: '轉讓合約',
    TERMINATE_CONTRACT: '終止合約',
    EXTEND_CONTRACT: '延期合約',
    RENEW_CONTRACT: '續約',
    PAUSE_HINT: '暫停期間將自動延長合約結束日期',
    RESUME_HINT: '恢復後合約將繼續有效至原定結束日期',
    PAUSE_START: '暫停開始日',
    PAUSE_END: '暫停結束日',
    PAUSE_REASON_PLACEHOLDER: '請輸入暫停原因...',
    CONFIRM_PAUSE: '確定暫停',
    CONFIRM_RESUME: '確定恢復',
    CONFIRM_RESUME_QUESTION: '確定要恢復此合約嗎？',
    CONFIRM_TRANSFER: '確定轉讓',
    TRANSFER_TO_MEMBER: '將此合約轉讓給另一位會員',
    SEARCH_TARGET_MEMBER: '搜尋目標會員',
    SEARCH_MEMBER_PLACEHOLDER: '輸入姓名、會員編號或電話...',
    TRANSFER_REASON: '轉讓原因（選填）',
    TRANSFER_REASON_PLACEHOLDER: '請輸入轉讓原因...',
    NO_MEMBER_FOUND: '找不到符合的會員',
    NO_PHONE: '無電話',
    // Terminate
    TERMINATE_HINT: '終止合約後將無法恢復，請確認是否要終止',
    TERMINATE_REASON: '終止原因',
    TERMINATE_REASON_PLACEHOLDER: '請輸入終止原因...',
    CONFIRM_TERMINATE: '確定終止',
    CONFIRM_TERMINATE_QUESTION: '確定要終止此合約嗎？此操作無法恢復。',
    REFUND_AMOUNT: '退款金額',
    NO_REFUND: '不退款',
    // Extend
    EXTEND_HINT: '延期將延長合約的結束日期',
    EXTEND_DAYS: '延期天數',
    EXTEND_DAYS_PLACEHOLDER: '請輸入延期天數',
    NEW_END_DATE: '新結束日期',
    EXTEND_REASON: '延期原因',
    EXTEND_REASON_PLACEHOLDER: '請輸入延期原因...',
    CONFIRM_EXTEND: '確定延期',
    // Renew
    RENEW_HINT: '續約將以原方案建立新合約',
    RENEW_START_DATE: '新合約開始日',
    RENEW_AMOUNT: '續約金額',
    CONFIRM_RENEW: '確定續約',
    RENEW_SUCCESS: '續約成功，已建立新合約',
    // New Contract
    CREATE_TITLE: '新增合約',
    CREATE_CONTRACT: '建立會員合約',
    STEP_SELECT_PLAN: '選擇方案',
    STEP_CONFIRM: '確認資訊',
    STEP_SIGN: '簽名確認',
    SELECT_MEMBER_PLAN: '選擇會員與方案',
    SELECT_MEMBER: '選擇會員',
    SELECT_MEMBER_PLACEHOLDER: '請選擇會員',
    SELECT_PLAN: '會籍方案',
    SELECT_PLAN_PLACEHOLDER: '請選擇方案',
    SELECT_BRANCH: '所屬分店',
    SELECT_BRANCH_PLACEHOLDER: '請選擇分店',
    SELECT_START_DATE: '開始日期',
    CONFIRM_CONTRACT_INFO: '確認合約資訊',
    SIGN_INSTRUCTION: '請會員於下方簽名區簽名，簽名後將作為合約確認依據。',
    SIGN_LEGAL_NOTE: '電子簽名具有與紙本簽名同等法律效力。',
    COMPLETE_SIGN: '完成簽約',
    // Summary
    MEMBER_NAME: '會員姓名',
    MEMBER_CODE: '會員編號',
    PLAN_NAME: '方案名稱',
    CONTRACT_PERIOD: '合約期間',
    PAYMENT_INFO: '付款資訊',
    TOTAL_AMOUNT: '合約總金額',
    NOTES_PLACEHOLDER: '輸入備註 (選填)...',
    CONTRACT_TERMS: '合約條款摘要',
    // Plan preview
    DURATION_LABEL: '期限',
    CLASS_COUNTS: '課程次數',
    // Validation
    ERROR_SELECT_MEMBER: '請選擇會員',
    ERROR_SELECT_PLAN: '請選擇方案',
    ERROR_SELECT_BRANCH: '請選擇分店',
    ERROR_SELECT_START_DATE: '請選擇開始日期',
    ERROR_AMOUNT_POSITIVE: '金額必須大於 0',
    ERROR_SIGNATURE_REQUIRED: '請簽名確認',
    ERROR_CREATE_FAILED: '建立合約失敗，請稍後再試',
    // Units
    MONTHS: '個月',
    TIMES: '次',
  },

  // Payments
  PAYMENTS: {
    TITLE: '收款管理',
    DESCRIPTION: '收款紀錄、退款與對帳',
    ADD_PAYMENT: '新增收款',
    ADD_REFUND: '新增退款',
    NO_PAYMENTS: '尚無收款紀錄',
    NO_PAYMENTS_HINT: '新增第一筆收款開始記錄',
    TOTAL_PAYMENT: '收款金額',
    TOTAL_REFUND: '退款金額',
    NET_PAYMENT: '淨收款',
    RECORD_INFO: '記錄收款或退款資訊',
    MEMBER_CONTRACT: '會員與合約',
    RELATED_CONTRACT: '關聯合約（選填）',
    SELECT_MEMBER: '選擇會員',
    SELECT_MEMBER_PLACEHOLDER: '請選擇會員',
    NO_CONTRACT_LINK: '不關聯合約',
    SELECT_MEMBER_FIRST: '請先選擇會員',
    AMOUNT_METHOD: '金額與付款方式',
    OTHER_INFO: '其他資訊',
    PAYMENT_DATE: '付款日期',
    PAYMENT_BRANCH: '收款分店',
    SELECT_BRANCH_PLACEHOLDER: '請選擇分店',
    CONTRACT_AMOUNT: '合約金額',
    // Filters
    ALL_TYPES: '全部類型',
    DATE_RANGE_ALL: '全部',
    DATE_RANGE_TODAY: '今日',
    DATE_RANGE_WEEK: '本週',
    DATE_RANGE_MONTH: '本月',
    // Table headers
    DATE: '日期',
    TYPE: '類型',
    MEMBER: '會員',
    CONTRACT_NO: '合約編號',
    PAYMENT_METHOD: '付款方式',
    BRANCH: '分店',
    AMOUNT: '金額',
    ENTRIES: '筆',
    // Validation
    ERROR_SELECT_MEMBER: '請選擇會員',
    ERROR_AMOUNT_POSITIVE: '金額必須大於 0',
    ERROR_SELECT_DATE: '請選擇付款日期',
    ERROR_SELECT_BRANCH: '請選擇分店',
    ERROR_CREATE_FAILED: '建立收款紀錄失敗，請稍後再試',
    // Submit
    CONFIRM_INCOME: '確認收款',
    CONFIRM_REFUND: '確認退款',
  },

  // Branches
  BRANCHES: {
    TITLE: '分店管理',
    DESCRIPTION: '管理所有分店與場館資訊',
    ADD_BRANCH: '新增分店',
    EDIT_BRANCH: '編輯分店',
    BRANCH_DETAILS: '分店詳情',
    NO_BRANCHES: '尚無分店',
    NO_BRANCHES_HINT: '建立第一個分店開始管理',
    TOTAL_BRANCHES: '總分店數',
    HEADQUARTERS: '總部',
    TAX_ID_PREFIX: '統編：',
    // Form Labels
    BRANCH_NAME: '分店名稱',
    BRANCH_NAME_PLACEHOLDER: '請輸入分店名稱',
    BRANCH_TYPE: '分店類型',
    ADDRESS: '地址',
    ADDRESS_PLACEHOLDER: '請輸入完整地址',
    PHONE: '電話',
    PHONE_PLACEHOLDER: '請輸入聯絡電話',
    TAX_ID: '統一編號',
    TAX_ID_PLACEHOLDER: '請輸入統一編號',
    STATUS: '狀態',
    // Detail Page
    BASIC_INFO: '基本資訊',
    CONTACT_INFO: '聯絡資訊',
    EMPLOYEES: '分店員工',
    NO_EMPLOYEES: '目前尚無員工',
    EMPLOYEE_COUNT: '員工人數',
    CREATED_AT: '建立時間',
    UPDATED_AT: '更新時間',
    // Actions
    ARCHIVE_BRANCH: '停用分店',
    ACTIVATE_BRANCH: '啟用分店',
    DELETE_BRANCH: '刪除分店',
    CONFIRM_ARCHIVE: '確定要停用此分店嗎？',
    CONFIRM_DELETE: '確定要刪除此分店嗎？此操作無法復原。',
    // Validation
    ERROR_NAME_REQUIRED: '請輸入分店名稱',
    ERROR_TYPE_REQUIRED: '請選擇分店類型',
    ERROR_CREATE_FAILED: '建立分店失敗，請稍後再試',
    ERROR_UPDATE_FAILED: '更新分店失敗，請稍後再試',
    ERROR_NOT_FOUND: '找不到此分店',
  },

  // Checkin
  CHECKIN: {
    TITLE: '會員入場',
    DESCRIPTION: '掃描會員條碼或搜尋會員進行入場登記',
    SEARCH_PLACEHOLDER: '搜尋會員姓名、編號或電話...',
    CONFIRM_CHECKIN: '確認入場',
    SCAN_OR_SEARCH: '掃描或搜尋會員',
    SCAN_HINT: '請掃描會員條碼或輸入會員資訊進行入場登記',
    TODAY_RECORDS: '今日入場紀錄',
    NO_RECORDS: '尚無入場紀錄',
  },

  // Plans
  PLANS: {
    TITLE: '會籍方案',
    DESCRIPTION: '管理所有會籍與產品方案',
    ADD_PLAN: '新增方案',
    EDIT_PLAN: '編輯方案',
    NO_PLANS: '尚無方案',
    NO_PLANS_HINT: '建立第一個會籍方案開始銷售',
    ENABLED_PLANS: '啟用方案',
    TIME_BASED_PLANS: '期限制方案',
    COUNT_BASED_PLANS: '堂數制方案',
    ARCHIVED: '已停用',
    MONTHS: '個月',
    CLASSES: '堂',
    EDIT: '編輯',
    // Form Labels
    PLAN_NAME: '方案名稱',
    PLAN_NAME_PLACEHOLDER: '請輸入方案名稱',
    PLAN_TYPE: '方案類型',
    PRICE: '售價',
    PRICE_PLACEHOLDER: '請輸入售價',
    DURATION_MONTHS: '期限（月）',
    DURATION_PLACEHOLDER: '請輸入月數',
    CLASS_COUNTS: '課程堂數',
    CLASS_COUNTS_PLACEHOLDER: '請輸入堂數',
    ALLOW_TRANSFER: '允許轉讓',
    ALLOW_PAUSE: '允許暫停',
    PLAN_DESCRIPTION: '方案說明',
    PLAN_DESCRIPTION_PLACEHOLDER: '請輸入方案說明（選填）',
    STATUS: '狀態',
    BASIC_INFO: '基本資訊',
    RULES_SETTINGS: '規則設定',
    // Validation
    ERROR_NAME_REQUIRED: '請輸入方案名稱',
    ERROR_TYPE_REQUIRED: '請選擇方案類型',
    ERROR_PRICE_REQUIRED: '請輸入售價',
    ERROR_PRICE_POSITIVE: '售價必須大於 0',
    ERROR_DURATION_REQUIRED: '請輸入期限',
    ERROR_DURATION_POSITIVE: '期限必須大於 0',
    ERROR_CLASS_COUNTS_REQUIRED: '請輸入堂數',
    ERROR_CLASS_COUNTS_POSITIVE: '堂數必須大於 0',
    ERROR_CREATE_FAILED: '建立方案失敗，請稍後再試',
    ERROR_UPDATE_FAILED: '更新方案失敗，請稍後再試',
    ERROR_NOT_FOUND: '找不到此方案',
  },

  // Reports
  REPORTS: {
    TITLE: '營運報表',
    DESCRIPTION: '查看營運數據與統計分析',
    REVENUE_TREND: '營收趨勢',
    POPULAR_PLANS: '熱門方案',
    SORT_BY_SALES: '依銷售數量排序',
    EXPORT_REPORTS: '匯出報表',
    // Metrics
    REVENUE: '營業收入',
    NEW_MEMBERS: '新會員',
    ACTIVE_CONTRACTS: '有效合約',
    CHECKINS: '入場人次',
    // Export Buttons
    EXPORT_REVENUE: '營收報表 (Excel)',
    EXPORT_MEMBERS: '會員報表 (Excel)',
    EXPORT_CONTRACTS: '合約報表 (Excel)',
    EXPORT_CHECKINS: '入場統計 (PDF)',
    // Units
    ENTRIES: '份',
  },

  // Employees
  EMPLOYEES: {
    TITLE: '員工管理',
    DESCRIPTION: '管理所有員工資料與權限',
    ADD_EMPLOYEE: '新增員工',
    NO_EMPLOYEES: '尚無員工資料',
    NO_EMPLOYEES_HINT: '新增第一位員工開始使用系統',
  },

  // HR - 人資管理
  HR: {
    TITLE: '人資管理',
    DESCRIPTION: '考勤打卡與休假管理',
    // 考勤
    ATTENDANCE: {
      TITLE: '考勤打卡',
      DESCRIPTION: '員工上下班打卡紀錄',
      CHECK_IN: '上班打卡',
      CHECK_OUT: '下班打卡',
      CHECKED_IN: '已打卡上班',
      CHECKED_OUT: '已打卡下班',
      NOT_CHECKED: '尚未打卡',
      TODAY_STATUS: '今日出勤狀態',
      WORK_HOURS: '工作時數',
      OVERTIME: '加班時數',
      LATE: '遲到',
      EARLY_LEAVE: '早退',
      PRESENT: '正常',
      ABSENT: '缺勤',
      ON_LEAVE: '請假',
      RECENT_RECORDS: '近期打卡紀錄',
      NO_RECORDS: '尚無打卡紀錄',
      LOCATION_INFO: '位置資訊',
      IP_ADDRESS: 'IP 位址',
      DEVICE: '裝置',
    },
    // 休假
    LEAVES: {
      TITLE: '休假管理',
      DESCRIPTION: '請假申請與審核',
      APPLY_LEAVE: '申請休假',
      MY_LEAVES: '我的休假',
      PENDING_APPROVAL: '待審核',
      APPROVED: '已核准',
      REJECTED: '已駁回',
      CANCELLED: '已取消',
      LEAVE_BALANCE: '休假餘額',
      ANNUAL: '特休',
      SICK: '病假',
      PERSONAL: '事假',
      MATERNITY: '產假',
      BEREAVEMENT: '喪假',
      OTHER: '其他',
      TOTAL_DAYS: '總天數',
      USED_DAYS: '已使用',
      REMAINING: '剩餘',
      START_DATE: '開始日期',
      END_DATE: '結束日期',
      DAYS_REQUESTED: '申請天數',
      REASON: '請假原因',
      APPROVER: '審核人',
      APPROVAL_HISTORY: '審核歷程',
      SUBMIT: '提交申請',
      APPROVE: '核准',
      REJECT: '駁回',
      CANCEL: '取消申請',
      NO_LEAVES: '尚無休假紀錄',
      TEAM_LEAVES: '團隊休假',
      SELECT_LEAVE_TYPE: '選擇假別',
      SELECT_DATE_RANGE: '選擇日期區間',
    },
    // 補打卡
    MAKEUP: {
      TITLE: '補打卡申請',
      DESCRIPTION: '申請補打卡與審核',
      APPLY_MAKEUP: '申請補打卡',
      MY_REQUESTS: '我的申請',
      PENDING_APPROVAL: '待審核',
      APPROVED: '已核准',
      REJECTED: '已駁回',
      CANCELLED: '已取消',
      TARGET_DATE: '補打卡日期',
      MAKEUP_TYPE: '補打卡類型',
      CHECK_IN: '補上班打卡',
      CHECK_OUT: '補下班打卡',
      BOTH: '上下班都補',
      REQUESTED_TIME: '申請時間',
      REQUESTED_CHECK_IN: '上班時間',
      REQUESTED_CHECK_OUT: '下班時間',
      REASON: '補打卡原因',
      REASON_PLACEHOLDER: '請說明需要補打卡的原因...',
      APPROVER: '審核人',
      APPROVAL_HISTORY: '審核歷程',
      SUBMIT: '提交申請',
      APPROVE: '核准',
      REJECT: '駁回',
      CANCEL: '取消申請',
      NO_REQUESTS: '尚無補打卡申請',
      SELECT_DATE: '選擇日期',
      SELECT_TYPE: '選擇類型',
    },
  },

  // Class Categories
  CLASS_CATEGORIES: {
    TITLE: '課程類別管理',
    DESCRIPTION: '管理課程類別與子類別設定',
    ADD_CATEGORY: '新增類別',
    EDIT_CATEGORY: '編輯類別',
    NO_CATEGORIES: '尚無課程類別',
    NO_CATEGORIES_HINT: '建立第一個類別開始管理課程',
    TOTAL_CATEGORIES: '總類別數',
    ACTIVE_CATEGORIES: '啟用類別',
    ROOT_CATEGORIES: '主類別',
    SUB_CATEGORIES: '子類別',
    // Form Labels
    CATEGORY_NAME: '類別名稱',
    CATEGORY_NAME_PLACEHOLDER: '請輸入類別名稱',
    CATEGORY_NAME_EN: '英文名稱',
    CATEGORY_NAME_EN_PLACEHOLDER: '請輸入英文名稱（選填）',
    CATEGORY_CODE: '類別代碼',
    CATEGORY_CODE_PLACEHOLDER: '請輸入類別代碼（如 yoga）',
    PARENT_CATEGORY: '父類別',
    SELECT_PARENT_PLACEHOLDER: '選擇父類別（留空為主類別）',
    ICON: '圖示',
    COLOR: '主題色',
    DESCRIPTION_LABEL: '類別說明',
    DESCRIPTION_PLACEHOLDER: '請輸入類別說明（選填）',
    IS_ACTIVE: '啟用狀態',
    REQUIRES_EQUIPMENT: '需要器材',
    EQUIPMENT_LIST: '器材列表',
    VISIBILITY: '可見性',
    VISIBILITY_SHARED: '所有分店可見',
    VISIBILITY_OWNER_ONLY: '僅擁有者分店',
    OWNER_BRANCH: '擁有者分店',
    // Table Headers
    NAME: '名稱',
    CODE: '代碼',
    PARENT: '父類別',
    STATUS: '狀態',
    ACTIONS: '操作',
    // Status
    ENABLED: '啟用',
    DISABLED: '停用',
    // Actions
    VIEW: '查看',
    EDIT: '編輯',
    DELETE: '刪除',
    CONFIRM_DELETE: '確定要刪除此類別嗎？',
    DELETE_WARNING: '刪除後將無法恢復，相關課程將失去類別關聯',
    // Validation
    ERROR_NAME_REQUIRED: '請輸入類別名稱',
    ERROR_CODE_REQUIRED: '請輸入類別代碼',
    ERROR_CODE_EXISTS: '此代碼已存在',
  },

  // Classes (課程定義)
  CLASSES: {
    TITLE: '課程管理',
    DESCRIPTION: '管理課程定義與設定',
    ADD_CLASS: '新增課程',
    EDIT_CLASS: '編輯課程',
    NO_CLASSES: '尚無課程',
    NO_CLASSES_HINT: '建立第一個課程開始使用系統',
    SEARCH_PLACEHOLDER: '搜尋課程名稱或說明...',
    // Stats
    TOTAL_CLASSES: '課程總數',
    ACTIVE_CLASSES: '啟用課程',
    // Form Labels
    CLASS_NAME: '課程名稱',
    CLASS_NAME_PLACEHOLDER: '請輸入課程名稱',
    DURATION: '課程時長',
    DURATION_MINUTES: '分鐘',
    MAX_CAPACITY: '最大人數',
    INSTRUCTOR: '授課教練',
    SELECT_INSTRUCTOR: '選擇教練',
    CATEGORY: '課程類別',
    SELECT_CATEGORY: '選擇類別',
    DIFFICULTY: '難度',
    DIFFICULTY_BEGINNER: '初級',
    DIFFICULTY_INTERMEDIATE: '中級',
    DIFFICULTY_ADVANCED: '進階',
    IS_ACTIVE: '啟用狀態',
    REQUIRES_COUNT: '需扣堂數',
    COUNT_DEDUCTION: '每次扣除堂數',
    IMAGE_URL: '課程圖片',
    // Table Headers
    NAME: '課程名稱',
    BRANCH: '分店',
    STATUS: '狀態',
    ACTIONS: '操作',
    // Status
    ENABLED: '啟用',
    DISABLED: '停用',
    // Validation
    ERROR_NAME_REQUIRED: '請輸入課程名稱',
    ERROR_DURATION_REQUIRED: '請輸入課程時長',
    ERROR_CAPACITY_REQUIRED: '請輸入最大人數',
  },

  // Class Schedule (課程排程)
  CLASS_SCHEDULE: {
    TITLE: '課程排程',
    DESCRIPTION: '管理課程場次與時間表',
    // Views
    WEEK_VIEW: '週視圖',
    DAY_VIEW: '日視圖',
    LIST_VIEW: '列表視圖',
    // Schedule Management
    ADD_SCHEDULE: '新增排程',
    EDIT_SCHEDULE: '編輯排程',
    NO_SCHEDULES: '尚無排程',
    NO_SCHEDULES_HINT: '建立課程排程開始安排課程',
    // Session Management
    ADD_SESSION: '新增臨時場次',
    CANCEL_SESSION: '取消場次',
    GENERATE_SESSIONS: '生成場次',
    GENERATE_HINT: '依據週排程自動生成未來場次',
    // Labels
    DAY_OF_WEEK: '星期',
    START_TIME: '開始時間',
    END_TIME: '結束時間',
    ROOM: '教室',
    SESSION_DATE: '課程日期',
    IS_RECURRING: '週循環',
    VALID_FROM: '有效期開始',
    VALID_UNTIL: '有效期結束',
    // Session Status
    SCHEDULED: '已排定',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    CANCEL_REASON: '取消原因',
    // Stats
    CURRENT_COUNT: '已預約',
    WAITLIST_COUNT: '候補人數',
    AVAILABLE_SPOTS: '剩餘名額',
    // Days
    SUNDAY: '週日',
    MONDAY: '週一',
    TUESDAY: '週二',
    WEDNESDAY: '週三',
    THURSDAY: '週四',
    FRIDAY: '週五',
    SATURDAY: '週六',
  },

  // Class Bookings (課程預約)
  CLASS_BOOKINGS: {
    TITLE: '預約管理',
    DESCRIPTION: '管理會員課程預約',
    // Actions
    BOOK_CLASS: '預約課程',
    CANCEL_BOOKING: '取消預約',
    ATTEND: '簽到',
    MARK_NO_SHOW: '標記未出席',
    NO_BOOKINGS: '尚無預約',
    NO_BOOKINGS_HINT: '會員預約課程後將在此顯示',
    SEARCH_PLACEHOLDER: '搜尋會員姓名或編號...',
    // Status
    CONFIRMED: '已確認',
    WAITLIST: '候補中',
    CANCELLED: '已取消',
    ATTENDED: '已出席',
    NO_SHOW: '未出席',
    // Labels
    BOOKING_TIME: '預約時間',
    WAITLIST_POSITION: '候補順位',
    MEMBER: '會員',
    SESSION: '場次',
    CONTRACT: '關聯合約',
    // Stats
    CONFIRMED_COUNT: '已確認',
    WAITLIST_COUNT: '候補中',
    ATTENDED_COUNT: '已出席',
    NO_SHOW_COUNT: '未出席',
    // Prompts
    CANCEL_REASON: '取消原因',
    CANCEL_REASON_PLACEHOLDER: '請輸入取消原因（選填）...',
    CONFIRM_CANCEL: '確定取消此預約？',
    CONFIRM_ATTEND: '確定為此會員簽到？',
    CONFIRM_NO_SHOW: '確定標記為未出席？',
    // Success
    BOOKING_SUCCESS: '預約成功',
    CANCEL_SUCCESS: '取消預約成功',
    ATTEND_SUCCESS: '簽到成功',
    // Errors
    BOOKING_FAILED: '預約失敗',
    CANCEL_FAILED: '取消預約失敗',
    ATTEND_FAILED: '簽到失敗',
    SESSION_FULL: '此場次已額滿',
    ALREADY_BOOKED: '已預約此場次',
  },
} as const

// ============================================
// Table Headers
// ============================================
export const TABLE = {
  MEMBERS: {
    CODE: '會員編號',
    NAME: '姓名',
    PHONE: '電話',
    EMAIL: 'Email',
    STATUS: '狀態',
    JOIN_DATE: '加入日期',
    ACTIONS: '操作',
  },
  CONTRACTS: {
    NUMBER: '合約編號',
    MEMBER: '會員',
    PLAN: '方案',
    PERIOD: '期間',
    AMOUNT: '金額',
    PAYMENT_STATUS: '付款狀態',
    STATUS: '合約狀態',
    ACTIONS: '操作',
  },
  PAYMENTS: {
    DATE: '日期',
    TYPE: '類型',
    MEMBER: '會員',
    AMOUNT: '金額',
    METHOD: '方式',
    HANDLER: '經手人',
    ACTIONS: '操作',
  },
  EMPLOYEES: {
    CODE: '員工編號',
    NAME: '姓名',
    JOB_TITLE: '職稱',
    BRANCH: '所屬分店',
    PHONE: '電話',
    STATUS: '狀態',
    ACTIONS: '操作',
  },
} as const

// ============================================
// Form Validation Messages
// ============================================
export const VALIDATION = {
  // Required
  REQUIRED: '此欄位為必填',

  // Name
  NAME_MIN: '姓名至少需要 2 個字',
  NAME_MAX: '姓名不能超過 50 個字',

  // Email
  EMAIL_INVALID: '請輸入有效的電子郵件',

  // Phone
  PHONE_INVALID: '請輸入有效的電話號碼（8-15 位數字）',
  PHONE_FORMAT: '電話格式不正確',

  // Date
  DATE_NOT_FUTURE: '日期不能是未來日期',
  DATE_NOT_PAST: '日期不能是過去日期',
  DATE_RANGE_INVALID: '結束日期必須晚於或等於開始日期',

  // Amount/Number
  AMOUNT_POSITIVE: '金額必須大於 0',
  AMOUNT_RANGE: '金額需介於 1 至 10,000,000 之間',
  NUMBER_POSITIVE: '數值必須大於 0',
  NUMBER_NON_NEGATIVE: '數值不能為負數',

  // Height
  HEIGHT_MIN: '身高至少 50 公分',
  HEIGHT_MAX: '身高不能超過 300 公分',

  // UUID
  UUID_INVALID: '無效的 ID 格式',

  // Branch
  BRANCH_REQUIRED: '請選擇分店',
  BRANCH_INVALID: '請選擇有效的分店',

  // Plan
  PLAN_REQUIRED: '請選擇方案',
  PLAN_PARAM_REQUIRED: '請填寫對應的方案參數',
  DURATION_POSITIVE: '期限必須大於 0',
  DURATION_MAX: '期限不能超過 120 個月',
  CLASS_COUNTS_POSITIVE: '堂數必須大於 0',
  CLASS_COUNTS_MAX: '堂數不能超過 9999',

  // Member
  MEMBER_REQUIRED: '請選擇會員',
  EMERGENCY_CONTACT_MAX: '緊急聯絡人姓名不能超過 50 個字',

  // Description
  DESCRIPTION_MAX: '說明不能超過 500 個字',
  NOTES_MAX: '備註不能超過 500 個字',

  // Tags
  TAGS_MAX: '最多只能有 10 個標籤',

  // Tax ID
  TAX_ID_INVALID: '統一編號格式不正確',
  TAX_ID_LENGTH: '統一編號需為 8 位數字',

  // Signature
  SIGNATURE_REQUIRED: '請簽名確認',
} as const

// ============================================
// API Endpoints (relative paths)
// ============================================
export const API = {
  AUTH: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    ME: '/api/auth/me',
  },
  /**
   * Backend-v2 API endpoints
   * All endpoints use session cookie authentication (credentials: 'include')
   */
  API: {
    MEMBERS: '/api/members',
    CONTRACTS: '/api/contracts',
    BRANCHES: '/api/branches',
    EMPLOYEES: '/api/employees',
    PLANS: '/api/membership-plans',
    PAYMENTS: '/api/payments',
    SHIFT_SCHEDULES: '/api/hr/shift-schedules',
    EMPLOYEE_SHIFTS: '/api/hr/employee-shifts',
    ATTENDANCES: '/api/hr/attendances',
  },
} as const
