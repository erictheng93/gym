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
    EXTENSION: '延期',
    TRANSFER: '轉讓',
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
    GENERIC: '發生錯誤，請稍後再試',
    NETWORK: '網路連線錯誤',
    NOT_FOUND: '找不到資料',
    UNAUTHORIZED: '權限不足',
    SERVER: '伺服器錯誤',
    REQUIRED_NAME: '請輸入姓名',
  },

  // Success
  SUCCESS: {
    SAVED: '儲存成功',
    DELETED: '刪除成功',
    UPDATED: '更新成功',
    CREATED: '建立成功',
    CHECKIN: '入場成功!',
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
    PAUSE_HINT: '暫停期間將自動延長合約結束日期',
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
// API Endpoints (relative paths)
// ============================================
export const API = {
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    ME: '/users/me',
  },
  ITEMS: {
    MEMBERS: '/items/members',
    CONTRACTS: '/items/contracts',
    BRANCHES: '/items/branches',
    EMPLOYEES: '/items/employees',
    PLANS: '/items/membership_plans',
    PAYMENTS: '/items/payments',
  },
} as const
