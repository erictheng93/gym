/**
 * Leads Routes Unit Tests
 * 測試 /gym/leads/* 路由
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerLeadsRoutes } from '../../src/routes/leads.js';
import {
  mockDatabase,
  mockDirectusContext,
  createMockRequest,
  createMockResponse,
} from '../setup.js';

describe('Leads Routes', () => {
  let router;
  let routeHandlers;

  beforeEach(() => {
    vi.clearAllMocks();

    // 創建模擬的 Express router
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

    // Mock database methods
    mockDatabase.select = vi.fn().mockReturnThis();
    mockDatabase.from = vi.fn().mockReturnThis();
    mockDatabase.leftJoin = vi.fn().mockReturnThis();
    mockDatabase.where = vi.fn().mockReturnThis();
    mockDatabase.whereNotIn = vi.fn().mockReturnThis();
    mockDatabase.whereBetween = vi.fn().mockReturnThis();
    mockDatabase.whereNotNull = vi.fn().mockReturnThis();
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
    mockDatabase.onConflict = vi.fn().mockReturnThis();
    mockDatabase.merge = vi.fn();

    // 註冊路由
    registerLeadsRoutes(router, mockDirectusContext);
  });

  // ============================================
  // GET /leads
  // ============================================
  describe('GET /leads', () => {
    const getHandler = () => routeHandlers['GET /leads'];

    it('應該成功返回潛在客戶列表', async () => {
      const mockLeads = [
        { id: 'lead-1', name: '張三', phone: '0912345678', status: 'NEW', source: 'FB_AD' },
        { id: 'lead-2', name: '李四', phone: '0923456789', status: 'CONTACTED', source: 'WALK_IN' },
      ];

      mockDatabase.first.mockResolvedValueOnce({ count: '2' });
      mockDatabase.offset.mockResolvedValueOnce(mockLeads);

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data).toHaveLength(2);
      expect(res._jsonData.meta.total).toBe(2);
    });

    it('應該支援狀態篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { status: 'NEW' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
      expect(res._jsonData.success).toBe(true);
    });

    it('應該支援來源篩選', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { source: 'FB_AD' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(mockDatabase.where).toHaveBeenCalled();
      expect(res._jsonData.success).toBe(true);
    });

    it('應該支援搜尋功能', async () => {
      mockDatabase.first.mockResolvedValueOnce({ count: '0' });
      mockDatabase.offset.mockResolvedValueOnce([]);

      const req = createMockRequest({ query: { search: '張三' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
    });

    it('應該處理資料庫錯誤', async () => {
      mockDatabase.first.mockRejectedValueOnce(new Error('Database error'));

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(500);
      expect(res._jsonData.success).toBe(false);
    });
  });

  // ============================================
  // GET /leads/:id
  // ============================================
  describe('GET /leads/:id', () => {
    const getHandler = () => routeHandlers['GET /leads/:id'];

    it('應該成功返回單一潛在客戶', async () => {
      const mockLead = {
        id: 'lead-1',
        name: '張三',
        phone: '0912345678',
        status: 'NEW',
        source: 'FB_AD',
      };
      const mockActivities = [
        { id: 'activity-1', activity_type: 'CALL', content: '初次聯繫' },
      ];

      mockDatabase.first.mockResolvedValueOnce(mockLead);
      mockDatabase.orderBy.mockResolvedValueOnce(mockActivities);

      const req = createMockRequest({ params: { id: 'lead-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.id).toBe('lead-1');
      expect(res._jsonData.data.activities).toHaveLength(1);
    });

    it('應該在找不到時返回 404', async () => {
      mockDatabase.first.mockResolvedValueOnce(null);

      const req = createMockRequest({ params: { id: 'non-existent' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(404);
      expect(res._jsonData.success).toBe(false);
    });
  });

  // ============================================
  // POST /leads
  // ============================================
  describe('POST /leads', () => {
    const getHandler = () => routeHandlers['POST /leads'];

    it('應該成功建立潛在客戶', async () => {
      const newLead = {
        id: 'lead-new',
        name: '新客戶',
        phone: '0912345678',
        source: 'WEBSITE',
        branch_id: 'branch-1',
        status: 'NEW',
      };

      mockDatabase.first.mockResolvedValueOnce(null); // No duplicate
      mockDatabase.returning.mockResolvedValueOnce([newLead]);
      // Second insert (lead_activities) doesn't use returning, needs to resolve
      mockDatabase.insert
        .mockReturnValueOnce(mockDatabase) // First insert (lead) chains to returning
        .mockResolvedValueOnce(undefined); // Second insert (activity) is terminal

      const req = createMockRequest({
        body: {
          name: '新客戶',
          phone: '0912345678',
          source: 'WEBSITE',
          branch_id: 'branch-1',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(201);
      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.id).toBe('lead-new');
    });

    it('應該驗證必填欄位 - name', async () => {
      const req = createMockRequest({
        body: {
          phone: '0912345678',
          source: 'WEBSITE',
          branch_id: 'branch-1',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('name');
    });

    it('應該驗證必填欄位 - phone', async () => {
      const req = createMockRequest({
        body: {
          name: '新客戶',
          source: 'WEBSITE',
          branch_id: 'branch-1',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('phone');
    });

    it('應該驗證來源值', async () => {
      const req = createMockRequest({
        body: {
          name: '新客戶',
          phone: '0912345678',
          source: 'INVALID_SOURCE',
          branch_id: 'branch-1',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('source');
    });

    it('應該檢查重複電話號碼', async () => {
      mockDatabase.first.mockResolvedValueOnce({ id: 'existing-lead' });

      const req = createMockRequest({
        body: {
          name: '新客戶',
          phone: '0912345678',
          source: 'WEBSITE',
          branch_id: 'branch-1',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('already exists');
    });
  });

  // ============================================
  // PATCH /leads/:id
  // ============================================
  describe('PATCH /leads/:id', () => {
    const getHandler = () => routeHandlers['PATCH /leads/:id'];

    it('應該成功更新潛在客戶', async () => {
      const existingLead = { id: 'lead-1', status: 'NEW' };
      const updatedLead = { id: 'lead-1', status: 'NEW', notes: '新備註' };

      mockDatabase.first.mockResolvedValueOnce(existingLead);
      mockDatabase.returning.mockResolvedValueOnce([updatedLead]);

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: { notes: '新備註' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.notes).toBe('新備註');
    });

    it('應該驗證狀態轉換規則', async () => {
      const existingLead = { id: 'lead-1', status: 'NEW' };

      mockDatabase.first.mockResolvedValueOnce(existingLead);

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: { status: 'CONVERTED' }, // Invalid transition from NEW
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('Cannot transition');
    });

    it('應該允許有效的狀態轉換', async () => {
      const existingLead = { id: 'lead-1', status: 'NEW' };
      const updatedLead = { id: 'lead-1', status: 'CONTACTED' };

      mockDatabase.first.mockResolvedValueOnce(existingLead);
      mockDatabase.returning.mockResolvedValueOnce([updatedLead]);

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: { status: 'CONTACTED' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.status).toBe('CONTACTED');
    });

    it('應該在找不到時返回 404', async () => {
      mockDatabase.first.mockResolvedValueOnce(null);

      const req = createMockRequest({
        params: { id: 'non-existent' },
        body: { notes: '新備註' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(404);
    });
  });

  // ============================================
  // DELETE /leads/:id
  // ============================================
  describe('DELETE /leads/:id', () => {
    const getHandler = () => routeHandlers['DELETE /leads/:id'];

    it('應該成功標記為 LOST', async () => {
      const existingLead = { id: 'lead-1', status: 'NEW' };
      const deletedLead = { id: 'lead-1', status: 'LOST' };

      mockDatabase.first.mockResolvedValueOnce(existingLead);
      mockDatabase.returning.mockResolvedValueOnce([deletedLead]);

      const req = createMockRequest({ params: { id: 'lead-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.status).toBe('LOST');
    });

    it('應該拒絕刪除已轉換的潛在客戶', async () => {
      const existingLead = { id: 'lead-1', status: 'CONVERTED' };

      mockDatabase.first.mockResolvedValueOnce(existingLead);

      const req = createMockRequest({ params: { id: 'lead-1' } });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('Cannot delete');
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
  // POST /leads/:id/activities
  // ============================================
  describe('POST /leads/:id/activities', () => {
    const getHandler = () => routeHandlers['POST /leads/:id/activities'];

    it('應該成功新增跟進紀錄', async () => {
      const existingLead = { id: 'lead-1', status: 'CONTACTED' };
      const newActivity = {
        id: 'activity-1',
        lead_id: 'lead-1',
        activity_type: 'CALL',
        content: '電話聯繫',
      };

      mockDatabase.first.mockResolvedValueOnce(existingLead);
      mockDatabase.returning.mockResolvedValueOnce([newActivity]);

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: {
          activity_type: 'CALL',
          content: '電話聯繫',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(201);
      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.activity_type).toBe('CALL');
    });

    it('應該驗證活動類型', async () => {
      const existingLead = { id: 'lead-1', status: 'NEW' };

      mockDatabase.first.mockResolvedValueOnce(existingLead);

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: {
          activity_type: 'INVALID_TYPE',
          content: '內容',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('activity_type');
    });

    it('應該自動更新狀態為 CONTACTED（首次聯繫）', async () => {
      const existingLead = { id: 'lead-1', status: 'NEW' };
      const newActivity = { id: 'activity-1', activity_type: 'CALL' };

      mockDatabase.first.mockResolvedValueOnce(existingLead);
      mockDatabase.returning.mockResolvedValueOnce([newActivity]);
      // Update call for status change doesn't use returning
      mockDatabase.update.mockResolvedValueOnce(1);

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: {
          activity_type: 'CALL',
          content: '首次電話聯繫',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      // Should have called update to change status to CONTACTED
      expect(mockDatabase.update).toHaveBeenCalled();
    });
  });

  // ============================================
  // POST /leads/:id/convert
  // ============================================
  describe('POST /leads/:id/convert', () => {
    const getHandler = () => routeHandlers['POST /leads/:id/convert'];

    it('應該成功轉換為新會員', async () => {
      const existingLead = {
        id: 'lead-1',
        name: '張三',
        phone: '0912345678',
        email: 'test@example.com',
        branch_id: 'branch-1',
        status: 'VISITED',
        source: 'FB_AD',
      };
      const newMember = {
        id: 'member-1',
        full_name: '張三',
        member_code: 'M001',
      };
      const updatedLead = {
        ...existingLead,
        status: 'CONVERTED',
        converted_member_id: 'member-1',
      };

      mockDatabase.first
        .mockResolvedValueOnce(existingLead) // Get lead
        .mockResolvedValueOnce(null); // No existing member

      mockDatabase.returning
        .mockResolvedValueOnce([newMember]) // Create member
        .mockResolvedValueOnce([updatedLead]); // Update lead

      // insert: first for members (chains to returning), second for activity (terminal)
      mockDatabase.insert
        .mockReturnValueOnce(mockDatabase) // members insert chains to returning
        .mockResolvedValueOnce(undefined); // activity insert is terminal

      // update chains to returning
      mockDatabase.update.mockReturnValueOnce(mockDatabase);

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: { converted_by: 'emp-1' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.is_new_member).toBe(true);
    });

    it('應該連結到現有會員', async () => {
      const existingLead = {
        id: 'lead-1',
        name: '張三',
        phone: '0912345678',
        status: 'VISITED',
      };
      const existingMember = {
        id: 'member-1',
        full_name: '張三',
        member_code: 'M001',
      };
      const updatedLead = {
        ...existingLead,
        status: 'CONVERTED',
        converted_member_id: 'member-1',
      };

      mockDatabase.first
        .mockResolvedValueOnce(existingLead) // Get lead
        .mockResolvedValueOnce(existingMember); // Existing member found

      mockDatabase.returning.mockResolvedValueOnce([updatedLead]);

      // Activity insert doesn't use returning
      mockDatabase.insert.mockResolvedValueOnce(undefined);

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: {},
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.is_new_member).toBe(false);
    });

    it('應該拒絕轉換已轉換的客戶', async () => {
      const existingLead = { id: 'lead-1', status: 'CONVERTED' };

      mockDatabase.first.mockResolvedValueOnce(existingLead);

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: {},
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('already converted');
    });

    it('應該拒絕轉換已流失的客戶', async () => {
      const existingLead = { id: 'lead-1', status: 'LOST' };

      mockDatabase.first.mockResolvedValueOnce(existingLead);

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: {},
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('lost lead');
    });
  });

  // ============================================
  // POST /leads/:id/assign
  // ============================================
  describe('POST /leads/:id/assign', () => {
    const getHandler = () => routeHandlers['POST /leads/:id/assign'];

    it('應該成功指派客戶', async () => {
      const existingLead = { id: 'lead-1', assigned_to: null };
      const employee = { id: 'emp-1', full_name: '業務員' };
      const updatedLead = { id: 'lead-1', assigned_to: 'emp-1' };

      mockDatabase.first
        .mockResolvedValueOnce(existingLead)
        .mockResolvedValueOnce(employee);

      mockDatabase.returning.mockResolvedValueOnce([updatedLead]);

      // Activity insert doesn't use returning
      mockDatabase.insert.mockResolvedValueOnce(undefined);

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: {
          assigned_to: 'emp-1',
          assigned_by: 'manager-1',
        },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.assigned_to).toBe('emp-1');
    });

    it('應該驗證 assigned_to 必填', async () => {
      const existingLead = { id: 'lead-1' };

      mockDatabase.first.mockResolvedValueOnce(existingLead);

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: {},
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(400);
      expect(res._jsonData.message).toContain('assigned_to');
    });

    it('應該驗證員工存在', async () => {
      const existingLead = { id: 'lead-1' };

      mockDatabase.first
        .mockResolvedValueOnce(existingLead)
        .mockResolvedValueOnce(null); // Employee not found

      const req = createMockRequest({
        params: { id: 'lead-1' },
        body: { assigned_to: 'non-existent-emp' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._statusCode).toBe(404);
      expect(res._jsonData.message).toContain('Employee');
    });
  });

  // ============================================
  // GET /leads/analytics
  // ============================================
  describe('GET /leads/analytics', () => {
    const getHandler = () => routeHandlers['GET /leads/analytics'];

    it('應該返回分析資料', async () => {
      const sourceBreakdown = [
        { source: 'FB_AD', total: '50', converted: '10' },
        { source: 'WALK_IN', total: '30', converted: '15' },
      ];
      const statusBreakdown = [
        { status: 'NEW', count: '20' },
        { status: 'CONVERTED', count: '25' },
      ];
      const avgTime = { avg_days: '7.5' };
      const topPerformers = [
        { id: 'emp-1', full_name: '張業務', total_leads: '20', converted: '8' },
      ];

      mockDatabase.groupBy
        .mockResolvedValueOnce(sourceBreakdown)
        .mockResolvedValueOnce(statusBreakdown);

      mockDatabase.first.mockResolvedValueOnce(avgTime);
      mockDatabase.limit.mockResolvedValueOnce(topPerformers);

      const req = createMockRequest({
        query: { start_date: '2024-01-01', end_date: '2024-01-31' },
      });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.success).toBe(true);
      expect(res._jsonData.data.by_source).toHaveLength(2);
      expect(res._jsonData.data.by_status).toHaveLength(2);
      expect(res._jsonData.data.average_conversion_days).toBe('7.5');
    });

    it('應該計算轉換率', async () => {
      const sourceBreakdown = [
        { source: 'FB_AD', total: '100', converted: '20' },
      ];
      const statusBreakdown = [];
      const avgTime = { avg_days: '5' };
      const topPerformers = [];

      mockDatabase.groupBy
        .mockResolvedValueOnce(sourceBreakdown)
        .mockResolvedValueOnce(statusBreakdown);

      mockDatabase.first.mockResolvedValueOnce(avgTime);
      mockDatabase.limit.mockResolvedValueOnce(topPerformers);

      const req = createMockRequest({ query: {} });
      const res = createMockResponse();

      await getHandler()(req, res);

      expect(res._jsonData.data.by_source[0].conversion_rate).toBe('20.0');
    });
  });
});
