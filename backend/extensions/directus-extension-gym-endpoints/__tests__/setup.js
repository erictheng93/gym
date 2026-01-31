/**
 * Vitest Global Setup for Backend Tests
 * 提供 Directus context 和 Express 相關的 mocks
 */

import { vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Mock Database
// ============================================
export const mockDatabaseRaw = vi.fn();

// Create a chainable mock database that supports both
// database('table') and database.raw() patterns
const createMockDatabaseMethods = () => ({
  raw: mockDatabaseRaw,
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  whereRaw: vi.fn().mockReturnThis(),
  whereIn: vi.fn().mockReturnThis(),
  whereNotIn: vi.fn().mockReturnThis(),
  whereBetween: vi.fn().mockReturnThis(),
  whereNotNull: vi.fn().mockReturnThis(),
  andWhere: vi.fn().mockReturnThis(),
  orWhere: vi.fn().mockReturnThis(),
  orWhereBetween: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockReturnThis(),
  count: vi.fn().mockReturnThis(),
  sum: vi.fn().mockReturnThis(),
  avg: vi.fn().mockReturnThis(),
  groupBy: vi.fn().mockReturnThis(),
  first: vi.fn(),
  clone: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  onConflict: vi.fn().mockReturnThis(),
  merge: vi.fn(),
  then: vi.fn(),
});

// Create the base methods object
const baseMethods = createMockDatabaseMethods();

// Create a callable function that returns itself with all methods
export const mockDatabase = Object.assign(
  vi.fn().mockReturnValue(baseMethods),
  baseMethods
);

// Make the function return the same object for chaining
mockDatabase.mockReturnValue(mockDatabase);

// ============================================
// Mock Directus Context
// ============================================
export const mockDirectusContext = {
  database: mockDatabase,
  services: {
    ItemsService: vi.fn(),
    UsersService: vi.fn(),
  },
  getSchema: vi.fn().mockResolvedValue({}),
  accountability: null,
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
};

// ============================================
// Mock Express Request/Response
// ============================================
export function createMockRequest(overrides = {}) {
  return {
    query: {},
    params: {},
    body: {},
    headers: {},
    accountability: null,
    ...overrides,
  };
}

export function createMockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    _jsonData: null,
    _statusCode: 200,
  };

  // 捕獲實際的回應資料
  res.json.mockImplementation((data) => {
    res._jsonData = data;
    return res;
  });

  res.status.mockImplementation((code) => {
    res._statusCode = code;
    return res;
  });

  return res;
}

// ============================================
// Mock Redis Cache
// ============================================
export const mockGetCachedReport = vi.fn().mockResolvedValue(null);
export const mockSetCachedReport = vi.fn().mockResolvedValue(true);
export const mockInvalidateReportCache = vi.fn().mockResolvedValue(true);

vi.mock('../src/utils/redis.js', () => ({
  getCachedReport: mockGetCachedReport,
  setCachedReport: mockSetCachedReport,
  invalidateReportCache: mockInvalidateReportCache,
  getRedisClient: vi.fn(),
}));

// ============================================
// Test Utilities
// ============================================

/**
 * 創建模擬的資料庫查詢結果
 */
export function createDbResult(rows) {
  return { rows };
}

/**
 * 重設所有 mocks
 */
export function resetAllMocks() {
  mockDatabaseRaw.mockReset();
  mockGetCachedReport.mockReset().mockResolvedValue(null);
  mockSetCachedReport.mockReset().mockResolvedValue(true);
  mockInvalidateReportCache.mockReset().mockResolvedValue(true);
}

// ============================================
// Global Hooks
// ============================================
beforeEach(() => {
  resetAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ============================================
// Test Data Factories
// ============================================
export const testData = {
  revenueRow: (overrides = {}) => ({
    payment_day: '2024-01-15',
    branch_id: 'branch-uuid-1',
    branch_name: '台北總店',
    transaction_count: '10',
    total_income: '50000',
    total_refund: '1000',
    net_revenue: '49000',
    unique_members: '8',
    cash_income: '20000',
    credit_card_income: '25000',
    bank_transfer_income: '5000',
    line_pay_income: '0',
    ...overrides,
  }),

  memberGrowthRow: (overrides = {}) => ({
    join_day: '2024-01-15',
    branch_id: 'branch-uuid-1',
    branch_name: '台北總店',
    new_members: '5',
    active_members: '100',
    male_count: '3',
    female_count: '2',
    sales_persons_involved: '2',
    ...overrides,
  }),

  contractExpiryRow: (overrides = {}) => ({
    contract_id: 'contract-uuid-1',
    contract_no: 'C2024-001',
    member_id: 'member-uuid-1',
    member_name: '王小明',
    member_code: 'M001',
    member_phone: '0912345678',
    member_email: 'test@example.com',
    branch_id: 'branch-uuid-1',
    branch_name: '台北總店',
    plan_name: '年費會員',
    start_date: '2023-01-15',
    end_date: '2024-01-15',
    contract_status: 'active',
    payment_status: 'paid',
    days_until_expiry: 5,
    sales_person_id: 'emp-uuid-1',
    sales_person_name: '李業務',
    total_amount: '12000',
    total_paid: '12000',
    outstanding_amount: '0',
    ...overrides,
  }),

  memberActivityRow: (overrides = {}) => ({
    activity_day: '2024-01-15',
    branch_id: 'branch-uuid-1',
    branch_name: '台北總店',
    total_check_ins: '50',
    unique_members: '40',
    qr_code_count: '30',
    manual_count: '15',
    card_count: '5',
    morning_count: '20',
    afternoon_count: '15',
    evening_count: '15',
    ...overrides,
  }),

  employee: (overrides = {}) => ({
    id: 'emp-uuid-1',
    user_id: 'user-uuid-1',
    branch_id: 'branch-uuid-1',
    status: 'active',
    permissions: {
      reports: { view: true, manage: true },
    },
    ...overrides,
  }),
};
