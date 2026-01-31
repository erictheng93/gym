/**
 * Coupons Routes Unit Tests
 * 測試 /gym/coupons/* 路由
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerCouponsRoutes } from '../../src/routes/coupons.js';
import {
  mockDatabase,
  mockDirectusContext,
  createMockRequest,
  createMockResponse,
} from '../setup.js';

describe('Coupons Routes', () => {
  let router;
  let routeHandlers;

  beforeEach(() => {
    vi.clearAllMocks();

    routeHandlers = {};
    router = {
      get: vi.fn((path, handler) => {
        routeHandlers[`GET ${path}`] = handler;
      }),
      post: vi.fn((path, handler) => {
        routeHandlers[`POST ${path}`] = handler;
      }),
      patch: vi.fn((path, handler) => {
        routeHandlers[`PATCH ${path}`] = handler;
      }),
      delete: vi.fn((path, handler) => {
        routeHandlers[`DELETE ${path}`] = handler;
      }),
    };

    mockDatabase.select = vi.fn().mockReturnThis();
    mockDatabase.from = vi.fn().mockReturnThis();
    mockDatabase.leftJoin = vi.fn().mockReturnThis();
    mockDatabase.where = vi.fn().mockReturnThis();
    mockDatabase.whereRaw = vi.fn().mockReturnThis();
    mockDatabase.andWhere = vi.fn().mockReturnThis();
    mockDatabase.orderBy = vi.fn().mockReturnThis();
    mockDatabase.limit = vi.fn().mockReturnThis();
    mockDatabase.offset = vi.fn().mockReturnThis();
    mockDatabase.count = vi.fn().mockReturnThis();
    mockDatabase.first = vi.fn();
    mockDatabase.clone = vi.fn().mockReturnThis();
    mockDatabase.insert = vi.fn().mockReturnThis();
    mockDatabase.update = vi.fn().mockReturnThis();
    mockDatabase.returning = vi.fn();
    mockDatabase.increment = vi.fn().mockReturnThis();

    registerCouponsRoutes(router, mockDirectusContext);
  });

  // ============================================
  // GET /coupons
  // ============================================
  describe('GET /coupons', () => {
    const getHandler = () => routeHandlers['GET /coupons'];

    it('應該返回優惠券列表', async () => {
      const mockCoupons = [
        { id: 'coupon-1', code: 'SUMMER2025', discount_type: 'PERCENTAGE', discount_value: 10 },
        { id: 'coupon-2', code: 'FLAT500', discount_type: 'FIXED_AMOUNT', discount_value: 500 },
      ];

      mockDatabase.first.mockResolvedValueOnce({ count: '2' });
      mockDatabase.offset.mockResolvedValueOnce(mockCoupons);

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data).toHaveLength(2);
    });

    it('應該支援狀態篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { status: 'ACTIVE' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
    });

    it('應該支援折扣類型篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { discount_type: 'PERCENTAGE' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
    });
  });

  // ============================================
  // GET /coupons/:id
  // ============================================
  describe('GET /coupons/:id', () => {
    const getHandler = () => routeHandlers['GET /coupons/:id'];

    it('應該返回單一優惠券', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'SUMMER2025',
        discount_type: 'PERCENTAGE',
        discount_value: 10,
        status: 'ACTIVE',
      };

      mockDatabase.first.mockResolvedValueOnce(mockCoupon);

      const req = createMockRequest({ params: { id: 'coupon-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.code).toBe('SUMMER2025');
    });

    it('應該在找不到時返回 404', async () => {
      mockDatabase.first.mockResolvedValueOnce(null);

      const req = createMockRequest({ params: { id: 'non-existent' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(404);
    });
  });

  // ============================================
  // POST /coupons
  // ============================================
  describe('POST /coupons', () => {
    const getHandler = () => routeHandlers['POST /coupons'];

    it('應該成功建立優惠券', async () => {
      const newCoupon = {
        id: 'coupon-new',
        code: 'NEW2025',
        name: '新年優惠',
        discount_type: 'PERCENTAGE',
        discount_value: 15,
        status: 'ACTIVE',
      };

      mockDatabase.first.mockResolvedValueOnce(null); // No duplicate
      mockDatabase.returning.mockResolvedValueOnce([newCoupon]);

      const req = createMockRequest({
        body: {
          code: 'NEW2025',
          name: '新年優惠',
          discount_type: 'PERCENTAGE',
          discount_value: 15,
          start_date: '2025-01-01',
          end_date: '2025-12-31',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(201);
      expect(res._jsonData.success).toBe(true);
    });

    it('應該驗證必填欄位', async () => {
      const req = createMockRequest({
        body: {
          name: '新優惠',
          // Missing code, discount_type, etc.
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });

    it('應該驗證折扣類型', async () => {
      const req = createMockRequest({
        body: {
          code: 'TEST',
          name: '測試',
          discount_type: 'INVALID_TYPE',
          discount_value: 10,
          start_date: '2025-01-01',
          end_date: '2025-12-31',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('discount_type');
    });

    it('應該檢查代碼重複', async () => {
      mockDatabase.first.mockResolvedValueOnce({ id: 'existing' });

      const req = createMockRequest({
        body: {
          code: 'EXISTING',
          name: '測試',
          discount_type: 'PERCENTAGE',
          discount_value: 10,
          start_date: '2025-01-01',
          end_date: '2025-12-31',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('already exists');
    });
  });

  // ============================================
  // PATCH /coupons/:id
  // ============================================
  describe('PATCH /coupons/:id', () => {
    const getHandler = () => routeHandlers['PATCH /coupons/:id'];

    it('應該成功更新優惠券', async () => {
      const existingCoupon = { id: 'coupon-1', status: 'ACTIVE' };
      const updatedCoupon = { id: 'coupon-1', name: '更新名稱', status: 'ACTIVE' };

      mockDatabase.first.mockResolvedValueOnce(existingCoupon);
      mockDatabase.returning.mockResolvedValueOnce([updatedCoupon]);

      const req = createMockRequest({
        params: { id: 'coupon-1' },
        body: { name: '更新名稱' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
    });

    it('應該在找不到時返回 404', async () => {
      mockDatabase.first.mockResolvedValueOnce(null);

      const req = createMockRequest({
        params: { id: 'non-existent' },
        body: { name: '更新' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(404);
    });
  });

  // ============================================
  // DELETE /coupons/:id
  // ============================================
  describe('DELETE /coupons/:id', () => {
    const getHandler = () => routeHandlers['DELETE /coupons/:id'];

    it('應該成功停用優惠券', async () => {
      const existingCoupon = { id: 'coupon-1', status: 'ACTIVE' };
      const deactivatedCoupon = { id: 'coupon-1', status: 'INACTIVE' };

      mockDatabase.first.mockResolvedValueOnce(existingCoupon);
      mockDatabase.returning.mockResolvedValueOnce([deactivatedCoupon]);

      const req = createMockRequest({ params: { id: 'coupon-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.status).toBe('INACTIVE');
    });
  });

  // ============================================
  // POST /coupons/validate
  // ============================================
  describe('POST /coupons/validate', () => {
    const getHandler = () => routeHandlers['POST /coupons/validate'];

    it('應該驗證有效優惠券', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'SUMMER2025',
        name: '夏季促銷',
        discount_type: 'PERCENTAGE',
        discount_value: 10,
        min_purchase: 0,
        max_discount: null,
        usage_limit: 100,
        usage_per_member: 1,
        used_count: 50,
        applicable_plans: null,
        status: 'ACTIVE',
        start_date: '2024-01-01',
        end_date: '2027-12-31', // Use future date
      };

      mockDatabase.first
        .mockResolvedValueOnce(mockCoupon) // Get coupon
        .mockResolvedValueOnce({ count: '0' }); // No previous usage by member

      const req = createMockRequest({
        body: {
          code: 'SUMMER2025',
          member_id: 'member-1',
          amount: 5000,
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.valid).toBe(true);
      expect(res._jsonData.data.discount_amount).toBe(500);
    });

    it('應該拒絕過期優惠券', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'EXPIRED',
        status: 'ACTIVE',
        start_date: '2023-01-01',
        end_date: '2023-12-31',
      };

      mockDatabase.first.mockResolvedValueOnce(mockCoupon);

      const req = createMockRequest({
        body: {
          code: 'EXPIRED',
          member_id: 'member-1',
          amount: 5000,
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.data.valid).toBe(false);
      expect(res._jsonData.data.reason).toContain('過期');
    });

    it('應該拒絕已達使用上限的優惠券', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'LIMIT',
        status: 'ACTIVE',
        usage_limit: 10,
        used_count: 10,
        start_date: '2024-01-01',
        end_date: '2027-12-31', // Use future date
      };

      mockDatabase.first.mockResolvedValueOnce(mockCoupon);

      const req = createMockRequest({
        body: {
          code: 'LIMIT',
          member_id: 'member-1',
          amount: 5000,
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.data.valid).toBe(false);
      expect(res._jsonData.data.reason).toContain('上限');
    });

    it('應該拒絕會員已使用過的優惠券', async () => {
      const mockCoupon = {
        id: 'coupon-1',
        code: 'ONCE',
        status: 'ACTIVE',
        usage_per_member: 1,
        start_date: '2024-01-01',
        end_date: '2025-12-31',
      };

      mockDatabase.first
        .mockResolvedValueOnce(mockCoupon)
        .mockResolvedValueOnce({ count: '1' }); // Already used

      const req = createMockRequest({
        body: {
          code: 'ONCE',
          member_id: 'member-1',
          amount: 5000,
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.data.valid).toBe(false);
    });
  });

  // ============================================
  // GET /coupons/:id/usages
  // ============================================
  describe('GET /coupons/:id/usages', () => {
    const getHandler = () => routeHandlers['GET /coupons/:id/usages'];

    it('應該返回使用紀錄', async () => {
      const mockUsages = [
        { id: 'usage-1', coupon_id: 'coupon-1', member_id: 'member-1', discount_amount: 500 },
      ];

      mockDatabase.first.mockResolvedValueOnce({ count: '1' });
      mockDatabase.offset.mockResolvedValueOnce(mockUsages);

      const req = createMockRequest({
        params: { id: 'coupon-1' },
        query: {},
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data).toHaveLength(1);
    });
  });

  // ============================================
  // POST /coupons/generate-batch
  // ============================================
  describe('POST /coupons/generate-batch', () => {
    const getHandler = () => routeHandlers['POST /coupons/generate-batch'];

    it('應該成功批次產生優惠券', async () => {
      // First: get existing codes to avoid duplicates
      mockDatabase.select.mockResolvedValueOnce([]);
      // Then: bulk insert with returning
      mockDatabase.returning.mockResolvedValueOnce([
        { id: 'coupon-1', code: 'BATCH001' },
        { id: 'coupon-2', code: 'BATCH002' },
        { id: 'coupon-3', code: 'BATCH003' },
      ]);

      const req = createMockRequest({
        body: {
          prefix: 'BATCH',
          count: 3,
          name: '批次優惠',
          discount_type: 'FIXED_AMOUNT',
          discount_value: 100,
          start_date: '2026-01-01',
          end_date: '2027-12-31',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.count).toBe(3);
    });

    it('應該驗證數量範圍', async () => {
      const req = createMockRequest({
        body: {
          prefix: 'BATCH',
          count: 1001, // Too many (max is 1000)
          name: '批次優惠',
          discount_type: 'FIXED_AMOUNT',
          discount_value: 100,
          start_date: '2026-01-01',
          end_date: '2027-12-31',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ============================================
  // POST /coupons/apply
  // ============================================
  describe('POST /coupons/apply', () => {
    const getHandler = () => routeHandlers['POST /coupons/apply'];

    it('應該成功套用優惠券', async () => {
      const mockCoupon = { id: 'coupon-1', code: 'TEST' };
      const mockUsage = {
        id: 'usage-new',
        coupon_id: 'coupon-1',
        member_id: 'member-1',
        discount_amount: 500,
      };

      // Coupon lookup
      mockDatabase.first.mockResolvedValueOnce(mockCoupon);
      // Insert usage
      mockDatabase.returning.mockResolvedValueOnce([mockUsage]);
      // Increment count resolves
      mockDatabase.increment.mockResolvedValueOnce(1);

      const req = createMockRequest({
        body: {
          coupon_id: 'coupon-1',
          member_id: 'member-1',
          discount_amount: 500,
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(201);
      expect(res._jsonData.success).toBe(true);
      expect(mockDatabase.increment).toHaveBeenCalled();
    });
  });
});
