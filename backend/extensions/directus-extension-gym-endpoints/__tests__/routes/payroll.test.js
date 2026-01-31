/**
 * Payroll Routes Unit Tests
 * 測試 /gym/payroll/* 路由
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPayrollRoutes } from '../../src/routes/payroll.js';
import {
  mockDatabase,
  mockDirectusContext,
  createMockRequest,
  createMockResponse,
} from '../setup.js';

describe('Payroll Routes', () => {
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
    };

    mockDatabase.select = vi.fn().mockReturnThis();
    mockDatabase.from = vi.fn().mockReturnThis();
    mockDatabase.leftJoin = vi.fn().mockReturnThis();
    mockDatabase.where = vi.fn().mockReturnThis();
    mockDatabase.whereIn = vi.fn().mockReturnThis();
    mockDatabase.whereBetween = vi.fn().mockReturnThis();
    mockDatabase.andWhere = vi.fn().mockReturnThis();
    mockDatabase.orderBy = vi.fn().mockReturnThis();
    mockDatabase.limit = vi.fn().mockReturnThis();
    mockDatabase.offset = vi.fn().mockReturnThis();
    mockDatabase.count = vi.fn().mockReturnThis();
    mockDatabase.sum = vi.fn().mockReturnThis();
    mockDatabase.groupBy = vi.fn().mockReturnThis();
    mockDatabase.first = vi.fn();
    mockDatabase.clone = vi.fn().mockReturnThis();
    mockDatabase.insert = vi.fn().mockReturnThis();
    mockDatabase.update = vi.fn().mockReturnThis();
    mockDatabase.returning = vi.fn();
    mockDatabase.raw = vi.fn();

    registerPayrollRoutes(router, mockDirectusContext);
  });

  // ============================================
  // GET /payroll/salary-records
  // ============================================
  describe('GET /payroll/salary-records', () => {
    const getHandler = () => routeHandlers['GET /payroll/salary-records'];

    it('應該返回薪資紀錄列表', async () => {
      const mockRecords = [
        { id: 'salary-1', employee_id: 'emp-1', period: '2025-01', base_salary: 45000, status: 'PENDING' },
        { id: 'salary-2', employee_id: 'emp-2', period: '2025-01', base_salary: 55000, status: 'APPROVED' },
      ];

      mockDatabase.first.mockResolvedValueOnce({ count: '2' });
      mockDatabase.offset.mockResolvedValueOnce(mockRecords);

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data).toHaveLength(2);
    });

    it('應該支援期間篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { period: '2025-01' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
    });

    it('應該支援狀態篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { status: 'PENDING' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
    });

    it('應該支援分店篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { branch_id: 'branch-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
    });
  });

  // ============================================
  // GET /payroll/salary-records/:id
  // ============================================
  describe('GET /payroll/salary-records/:id', () => {
    const getHandler = () => routeHandlers['GET /payroll/salary-records/:id'];

    it('應該返回單一薪資紀錄', async () => {
      const mockRecord = {
        id: 'salary-1',
        employee_id: 'emp-1',
        period: '2025-01',
        base_salary: 45000,
        overtime_hours: 10,
        overtime_pay: 2812,
        bonus: 5000,
        deductions: 1000,
        net_salary: 51812,
        status: 'PENDING',
      };

      mockDatabase.first.mockResolvedValueOnce(mockRecord);

      const req = createMockRequest({ params: { id: 'salary-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.net_salary).toBe(51812);
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
  // POST /payroll/generate
  // ============================================
  describe('POST /payroll/generate', () => {
    const getHandler = () => routeHandlers['POST /payroll/generate'];

    it('應該成功產生薪資紀錄', async () => {
      const mockEmployees = [
        { id: 'emp-1', base_salary: 45000, branch_id: 'branch-1', job_title_base_salary: null },
      ];

      // Mock employees query
      mockDatabase.select.mockResolvedValueOnce(mockEmployees);

      // Mock for each employee: existing record check, attendance, leave, commission
      mockDatabase.first
        .mockResolvedValueOnce(null) // No existing record for emp-1
        .mockResolvedValueOnce({ work_days: '22', overtime_hours: '10' }) // attendance
        .mockResolvedValueOnce({ total: '100000' }); // commission contracts

      // Mock leave query
      mockDatabase.then = vi.fn((callback) => Promise.resolve(callback([])));

      mockDatabase.returning.mockResolvedValueOnce([{ id: 'salary-new' }]);

      const req = createMockRequest({
        body: { period: '2025-02' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
    });

    it('應該驗證期間格式', async () => {
      const req = createMockRequest({
        body: { period: 'invalid-format' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('period');
    });

    it('應該在沒有員工時返回 0', async () => {
      mockDatabase.select.mockResolvedValueOnce([]);

      const req = createMockRequest({
        body: { period: '2025-02' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.generated).toBe(0);
    });
  });

  // ============================================
  // PATCH /payroll/salary-records/:id
  // ============================================
  describe('PATCH /payroll/salary-records/:id', () => {
    const getHandler = () => routeHandlers['PATCH /payroll/salary-records/:id'];

    it('應該成功更新薪資紀錄', async () => {
      const existingRecord = {
        id: 'salary-1',
        status: 'PENDING',
        base_salary: 45000,
        bonus: 0,
        deductions: 0,
        overtime_pay: 0,
        commission: 0,
        calculation_detail: JSON.stringify({})
      };
      const updatedRecord = {
        id: 'salary-1',
        bonus: 8000,
        deductions: 500,
        total_salary: 52500,
      };

      mockDatabase.first.mockResolvedValueOnce(existingRecord);
      mockDatabase.returning.mockResolvedValueOnce([updatedRecord]);

      const req = createMockRequest({
        params: { id: 'salary-1' },
        body: {
          bonus: 8000,
          deductions: 500,
          notes: '績效獎金調整',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.bonus).toBe(8000);
    });

    it('應該拒絕更新已發放的紀錄', async () => {
      const existingRecord = { id: 'salary-1', status: 'PAID' };

      mockDatabase.first.mockResolvedValueOnce(existingRecord);

      const req = createMockRequest({
        params: { id: 'salary-1' },
        body: { bonus: 10000 },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ============================================
  // POST /payroll/salary-records/:id/approve
  // ============================================
  describe('POST /payroll/salary-records/:id/approve', () => {
    const getHandler = () => routeHandlers['POST /payroll/salary-records/:id/approve'];

    it('應該成功核准薪資', async () => {
      const existingRecord = { id: 'salary-1', status: 'PENDING' };
      const approvedRecord = { id: 'salary-1', status: 'APPROVED' };

      mockDatabase.first.mockResolvedValueOnce(existingRecord);
      mockDatabase.returning.mockResolvedValueOnce([approvedRecord]);

      const req = createMockRequest({
        params: { id: 'salary-1' },
        body: { approved_by: 'admin-1' }
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.status).toBe('APPROVED');
    });

    it('應該拒絕核准非待審狀態', async () => {
      const existingRecord = { id: 'salary-1', status: 'PAID' };

      mockDatabase.first.mockResolvedValueOnce(existingRecord);

      const req = createMockRequest({
        params: { id: 'salary-1' },
        body: { approved_by: 'admin-1' }
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ============================================
  // POST /payroll/batch-approve
  // ============================================
  describe('POST /payroll/batch-approve', () => {
    const getHandler = () => routeHandlers['POST /payroll/batch-approve'];

    it('應該成功批次核准', async () => {
      mockDatabase.update.mockResolvedValueOnce(3);

      const req = createMockRequest({
        body: {
          record_ids: ['salary-1', 'salary-2', 'salary-3'],
          approved_by: 'admin-1'
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.approved_count).toBe(3);
    });

    it('應該驗證 record_ids 必填', async () => {
      const req = createMockRequest({
        body: { approved_by: 'admin-1' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('record_ids');
    });

    it('應該驗證 record_ids 為非空陣列', async () => {
      const req = createMockRequest({
        body: { record_ids: [], approved_by: 'admin-1' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ============================================
  // POST /payroll/salary-records/:id/pay
  // ============================================
  describe('POST /payroll/salary-records/:id/pay', () => {
    const getHandler = () => routeHandlers['POST /payroll/salary-records/:id/pay'];

    it('應該成功標記已發放', async () => {
      const existingRecord = {
        id: 'salary-1',
        status: 'APPROVED',
        calculation_detail: JSON.stringify({})
      };
      const paidRecord = { id: 'salary-1', status: 'PAID' };

      mockDatabase.first.mockResolvedValueOnce(existingRecord);
      mockDatabase.returning.mockResolvedValueOnce([paidRecord]);

      const req = createMockRequest({ params: { id: 'salary-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.status).toBe('PAID');
    });

    it('應該拒絕未核准的紀錄', async () => {
      const existingRecord = { id: 'salary-1', status: 'PENDING' };

      mockDatabase.first.mockResolvedValueOnce(existingRecord);

      const req = createMockRequest({ params: { id: 'salary-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ============================================
  // GET /payroll/export/:period
  // ============================================
  describe('GET /payroll/export/:period', () => {
    const getHandler = () => routeHandlers['GET /payroll/export/:period'];

    it('應該匯出薪資報表', async () => {
      const mockRecords = [
        {
          employee_code: 'E001',
          employee_name: '張三',
          branch_name: '台北店',
          base_salary: 45000,
          overtime_hours: 10,
          overtime_pay: 2812,
          bonus: 5000,
          deductions: 1000,
          net_salary: 51812,
          status: 'APPROVED',
        },
      ];

      mockDatabase.orderBy.mockResolvedValueOnce(mockRecords);

      const req = createMockRequest({ params: { period: '2025-01' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('payroll_2025-01')
      );
    });

    it('應該支援 JSON 格式匯出', async () => {
      const mockRecords = [
        {
          employee_code: 'E001',
          full_name: '張三',
          base_salary: 45000,
          total_salary: 51812,
          status: 'APPROVED',
        },
      ];

      mockDatabase.orderBy.mockResolvedValueOnce(mockRecords);

      const req = createMockRequest({
        params: { period: '2025-01' },
        query: { format: 'json' }
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.period).toBe('2025-01');
    });
  });

  // ============================================
  // GET /payroll/promotions
  // ============================================
  describe('GET /payroll/promotions', () => {
    const getHandler = () => routeHandlers['GET /payroll/promotions'];

    it('應該返回異動紀錄列表', async () => {
      const mockPromotions = [
        { id: 'promo-1', employee_id: 'emp-1', type: 'PROMOTION', effective_date: '2025-02-01' },
        { id: 'promo-2', employee_id: 'emp-2', type: 'TRANSFER', effective_date: '2025-02-01' },
      ];

      mockDatabase.first.mockResolvedValueOnce({ count: '2' });
      mockDatabase.offset.mockResolvedValueOnce(mockPromotions);

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data).toHaveLength(2);
    });

    it('應該支援類型篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { type: 'PROMOTION' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
    });
  });

  // ============================================
  // POST /payroll/promotions
  // ============================================
  describe('POST /payroll/promotions', () => {
    const getHandler = () => routeHandlers['POST /payroll/promotions'];

    it('應該成功建立升遷紀錄', async () => {
      const newPromotion = {
        id: 'promo-new',
        employee_id: 'emp-1',
        type: 'PROMOTION',
        effective_date: '2025-03-01',
        to_job_title_id: 'jt-2',
        new_base_salary: 55000,
      };

      mockDatabase.first.mockResolvedValueOnce({ id: 'emp-1' }); // Employee exists
      mockDatabase.returning.mockResolvedValueOnce([newPromotion]);

      const req = createMockRequest({
        body: {
          employee_id: 'emp-1',
          type: 'PROMOTION',
          effective_date: '2025-03-01',
          to_job_title_id: 'jt-2',
          new_base_salary: 55000,
          reason: '績效優異',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(201);
      expect(res._jsonData.success).toBe(true);
    });

    it('應該成功建立調動紀錄', async () => {
      const newTransfer = {
        id: 'promo-transfer',
        employee_id: 'emp-1',
        type: 'TRANSFER',
        effective_date: '2025-03-01',
        to_branch_id: 'branch-2',
      };

      mockDatabase.first.mockResolvedValueOnce({ id: 'emp-1' });
      mockDatabase.returning.mockResolvedValueOnce([newTransfer]);

      const req = createMockRequest({
        body: {
          employee_id: 'emp-1',
          type: 'TRANSFER',
          effective_date: '2025-03-01',
          to_branch_id: 'branch-2',
          reason: '支援新分店',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(201);
      expect(res._jsonData.data.type).toBe('TRANSFER');
    });

    it('應該驗證異動類型', async () => {
      const req = createMockRequest({
        body: {
          employee_id: 'emp-1',
          type: 'INVALID_TYPE',
          effective_date: '2025-03-01',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('type');
    });

    it('應該驗證員工存在', async () => {
      mockDatabase.first.mockResolvedValueOnce(null);

      const req = createMockRequest({
        body: {
          employee_id: 'non-existent',
          type: 'PROMOTION',
          effective_date: '2025-03-01',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(404);
    });
  });
});
