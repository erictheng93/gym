/**
 * Performance Routes Unit Tests
 * 測試 /gym/performance/* 路由
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPerformanceRoutes } from '../../src/routes/performance.js';
import {
  mockDatabase,
  mockDirectusContext,
  createMockRequest,
  createMockResponse,
} from '../setup.js';

describe('Performance Routes', () => {
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
    mockDatabase.whereBetween = vi.fn().mockReturnThis();
    mockDatabase.whereIn = vi.fn().mockReturnThis();
    mockDatabase.orderBy = vi.fn().mockReturnThis();
    mockDatabase.limit = vi.fn().mockReturnThis();
    mockDatabase.offset = vi.fn().mockReturnThis();
    mockDatabase.count = vi.fn().mockReturnThis();
    mockDatabase.avg = vi.fn().mockReturnThis();
    mockDatabase.sum = vi.fn().mockReturnThis();
    mockDatabase.groupBy = vi.fn().mockReturnThis();
    mockDatabase.first = vi.fn();
    mockDatabase.clone = vi.fn().mockReturnThis();
    mockDatabase.insert = vi.fn().mockReturnThis();
    mockDatabase.update = vi.fn().mockReturnThis();
    mockDatabase.delete = vi.fn().mockReturnThis();
    mockDatabase.returning = vi.fn();

    registerPerformanceRoutes(router, mockDirectusContext);
  });

  // ============================================
  // GET /performance/reviews
  // ============================================
  describe('GET /performance/reviews', () => {
    const getHandler = () => routeHandlers['GET /performance/reviews'];

    it('應該返回績效考核列表', async () => {
      const mockReviews = [
        { id: 'review-1', employee_id: 'emp-1', review_period: '2025-01', status: 'DRAFT' },
        { id: 'review-2', employee_id: 'emp-2', review_period: '2025-01', status: 'APPROVED' },
      ];

      mockDatabase.first.mockResolvedValueOnce({ count: '2' });
      mockDatabase.offset.mockResolvedValueOnce(mockReviews);

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data).toHaveLength(2);
    });

    it('應該支援員工篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { employee_id: 'emp-1' } });
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

    it('應該支援考核類型篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { review_type: 'MONTHLY' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
    });
  });

  // ============================================
  // GET /performance/reviews/:id
  // ============================================
  describe('GET /performance/reviews/:id', () => {
    const getHandler = () => routeHandlers['GET /performance/reviews/:id'];

    it('應該返回單一績效考核', async () => {
      const mockReview = {
        id: 'review-1',
        employee_id: 'emp-1',
        review_period: '2025-01',
        review_type: 'MONTHLY',
        status: 'DRAFT',
        score: 85,
        kpi_scores: [{ id: 'kpi-1', name: '業績', score: 90 }],
      };

      mockDatabase.first.mockResolvedValueOnce(mockReview);

      const req = createMockRequest({ params: { id: 'review-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.score).toBe(85);
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
  // POST /performance/reviews
  // ============================================
  describe('POST /performance/reviews', () => {
    const getHandler = () => routeHandlers['POST /performance/reviews'];

    it('應該成功建立績效考核', async () => {
      const newReview = {
        id: 'review-new',
        employee_id: 'emp-1',
        review_period: '2025-02',
        review_type: 'MONTHLY',
        status: 'DRAFT',
      };

      mockDatabase.first
        .mockResolvedValueOnce({ id: 'emp-1', job_title_id: 'jt-1' }) // Employee exists
        .mockResolvedValueOnce(null) // No duplicate
        .mockResolvedValueOnce(null); // No KPI template
      mockDatabase.returning.mockResolvedValueOnce([newReview]);

      const req = createMockRequest({
        body: {
          employee_id: 'emp-1',
          review_period: '2025-02',
          review_type: 'MONTHLY',
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
          // Missing employee_id, review_period, review_type
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });

    it('應該驗證考核類型', async () => {
      const req = createMockRequest({
        body: {
          employee_id: 'emp-1',
          review_period: '2025-02',
          review_type: 'INVALID_TYPE',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('review_type');
    });

    it('應該檢查重複考核', async () => {
      mockDatabase.first
        .mockResolvedValueOnce({ id: 'emp-1' }) // Employee exists
        .mockResolvedValueOnce({ id: 'existing' }); // Duplicate found

      const req = createMockRequest({
        body: {
          employee_id: 'emp-1',
          review_period: '2025-01',
          review_type: 'MONTHLY',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('already exists');
    });
  });

  // ============================================
  // PATCH /performance/reviews/:id
  // ============================================
  describe('PATCH /performance/reviews/:id', () => {
    const getHandler = () => routeHandlers['PATCH /performance/reviews/:id'];

    it('應該成功更新績效考核', async () => {
      const existingReview = { id: 'review-1', status: 'DRAFT' };
      const updatedReview = { id: 'review-1', score: 88, status: 'DRAFT' };

      mockDatabase.first.mockResolvedValueOnce(existingReview);
      mockDatabase.returning.mockResolvedValueOnce([updatedReview]);

      const req = createMockRequest({
        params: { id: 'review-1' },
        body: { score: 88, comments: '表現良好' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.score).toBe(88);
    });

    it('應該拒絕更新已核准的考核', async () => {
      const existingReview = { id: 'review-1', status: 'APPROVED' };

      mockDatabase.first.mockResolvedValueOnce(existingReview);

      const req = createMockRequest({
        params: { id: 'review-1' },
        body: { score: 90 },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ============================================
  // POST /performance/reviews/:id/submit
  // ============================================
  describe('POST /performance/reviews/:id/submit', () => {
    const getHandler = () => routeHandlers['POST /performance/reviews/:id/submit'];

    it('應該成功提交績效考核', async () => {
      const existingReview = {
        id: 'review-1',
        status: 'DRAFT',
        kpi_data: JSON.stringify([{ id: 'kpi-1', name: '業績', weight: 100, target: 10 }])
      };
      const submittedReview = { id: 'review-1', status: 'SUBMITTED' };

      mockDatabase.first.mockResolvedValueOnce(existingReview);
      mockDatabase.returning.mockResolvedValueOnce([submittedReview]);

      const req = createMockRequest({ params: { id: 'review-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.status).toBe('SUBMITTED');
    });

    it('應該拒絕提交沒有 KPI 資料的考核', async () => {
      const existingReview = { id: 'review-1', status: 'DRAFT', kpi_data: null };

      mockDatabase.first.mockResolvedValueOnce(existingReview);

      const req = createMockRequest({ params: { id: 'review-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });

    it('應該拒絕非草稿狀態的提交', async () => {
      const existingReview = { id: 'review-1', status: 'SUBMITTED' };

      mockDatabase.first.mockResolvedValueOnce(existingReview);

      const req = createMockRequest({ params: { id: 'review-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ============================================
  // POST /performance/reviews/:id/approve
  // ============================================
  describe('POST /performance/reviews/:id/approve', () => {
    const getHandler = () => routeHandlers['POST /performance/reviews/:id/approve'];

    it('應該成功核准績效考核', async () => {
      const existingReview = { id: 'review-1', status: 'SUBMITTED' };
      const approvedReview = { id: 'review-1', status: 'APPROVED' };

      mockDatabase.first.mockResolvedValueOnce(existingReview);
      mockDatabase.returning.mockResolvedValueOnce([approvedReview]);

      const req = createMockRequest({
        params: { id: 'review-1' },
        body: { reviewer_id: 'reviewer-1' }
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.status).toBe('APPROVED');
    });

    it('應該拒絕核准非提交狀態的考核', async () => {
      const existingReview = { id: 'review-1', status: 'DRAFT' };

      mockDatabase.first.mockResolvedValueOnce(existingReview);

      const req = createMockRequest({
        params: { id: 'review-1' },
        body: { reviewer_id: 'reviewer-1' }
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ============================================
  // POST /performance/reviews/:id/reject
  // ============================================
  describe('POST /performance/reviews/:id/reject', () => {
    const getHandler = () => routeHandlers['POST /performance/reviews/:id/reject'];

    it('應該成功退回績效考核', async () => {
      const existingReview = { id: 'review-1', status: 'SUBMITTED', reviewer_comments: '' };
      const rejectedReview = { id: 'review-1', status: 'DRAFT' };

      mockDatabase.first.mockResolvedValueOnce(existingReview);
      mockDatabase.returning.mockResolvedValueOnce([rejectedReview]);

      const req = createMockRequest({
        params: { id: 'review-1' },
        body: { rejection_reason: '需要補充說明' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.status).toBe('DRAFT');
    });

    it('應該驗證退回原因必填', async () => {
      const existingReview = { id: 'review-1', status: 'SUBMITTED' };

      mockDatabase.first.mockResolvedValueOnce(existingReview);

      const req = createMockRequest({
        params: { id: 'review-1' },
        body: {}, // Missing rejection_reason
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
    });
  });

  // ============================================
  // GET /performance/kpi-templates
  // ============================================
  describe('GET /performance/kpi-templates', () => {
    const getHandler = () => routeHandlers['GET /performance/kpi-templates'];

    it('應該返回 KPI 範本列表', async () => {
      const mockTemplates = [
        { id: 'tpl-1', name: '業務人員 KPI', kpis: [{ name: '業績目標', weight: 50 }] },
        { id: 'tpl-2', name: '教練 KPI', kpis: [{ name: '課程數', weight: 40 }] },
      ];

      mockDatabase.orderBy.mockResolvedValueOnce(mockTemplates);

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data).toHaveLength(2);
    });
  });

  // ============================================
  // POST /performance/kpi-templates
  // ============================================
  describe('POST /performance/kpi-templates', () => {
    const getHandler = () => routeHandlers['POST /performance/kpi-templates'];

    it('應該成功建立 KPI 範本', async () => {
      const newTemplate = {
        id: 'tpl-new',
        name: '新範本',
        review_type: 'MONTHLY',
        kpi_config: JSON.stringify([{ id: 'kpi_1', name: '指標一', weight: 100, target: 10 }]),
      };

      mockDatabase.returning.mockResolvedValueOnce([newTemplate]);

      const req = createMockRequest({
        body: {
          name: '新範本',
          review_type: 'MONTHLY',
          kpi_config: [{ id: 'kpi_1', name: '指標一', weight: 100, target: 10 }],
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(201);
      expect(res._jsonData.success).toBe(true);
    });

    it('應該驗證權重總和為 100', async () => {
      const req = createMockRequest({
        body: {
          name: '新範本',
          review_type: 'MONTHLY',
          kpi_config: [
            { id: 'kpi_1', name: '指標一', weight: 50, target: 10 },
            { id: 'kpi_2', name: '指標二', weight: 30, target: 5 }, // Total = 80, not 100
          ],
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('100');
    });
  });


  // ============================================
  // GET /performance/team-dashboard
  // ============================================
  describe('GET /performance/team-dashboard', () => {
    const getHandler = () => routeHandlers['GET /performance/team-dashboard'];

    it('應該返回團隊績效總覽', async () => {
      const mockReviews = [
        { employee_id: 'emp-1', full_name: '張三', status: 'APPROVED', score: 95 },
        { employee_id: 'emp-2', full_name: '李四', status: 'APPROVED', score: 82 },
        { employee_id: 'emp-3', full_name: '王五', status: 'DRAFT', score: null },
      ];

      mockDatabase.select.mockResolvedValueOnce(mockReviews);

      const req = createMockRequest({ query: { period: '2025-01' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.summary.total_employees).toBe(3);
      expect(res._jsonData.data.summary.completed_reviews).toBe(2);
    });
  });

  // ============================================
  // GET /performance/employee/:id/history
  // ============================================
  describe('GET /performance/employee/:id/history', () => {
    const getHandler = () => routeHandlers['GET /performance/employee/:id/history'];

    it('應該返回員工歷史考核', async () => {
      const mockEmployee = { id: 'emp-1', full_name: '張三', employee_code: 'E001' };
      const mockHistory = [
        { id: 'review-1', review_period: '2025-01', score: 85, status: 'APPROVED' },
        { id: 'review-2', review_period: '2024-12', score: 82, status: 'APPROVED' },
      ];

      mockDatabase.first.mockResolvedValueOnce(mockEmployee);
      mockDatabase.limit.mockResolvedValueOnce(mockHistory);

      const req = createMockRequest({ params: { id: 'emp-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.reviews).toHaveLength(2);
    });

    it('應該在找不到員工時返回 404', async () => {
      mockDatabase.first.mockResolvedValueOnce(null);

      const req = createMockRequest({ params: { id: 'non-existent' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(404);
    });
  });
});
