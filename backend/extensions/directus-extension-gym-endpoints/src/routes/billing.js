/**
 * Billing and Subscription Routes
 * /gym/billing/*
 * 订阅和账单管理端点
 */

import PDFGenerator from '../services/pdf-generator.js';

/**
 * 注册账单路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerBillingRoutes(router, context) {
  const { database } = context;

  /**
   * GET /gym/billing/subscriptions
   * 获取租户的订阅信息
   */
  router.get('/billing/subscriptions', async (req, res) => {
    try {
      const { tenantId, isSuperAdmin } = req;

      // 超级管理员可以查看所有租户
      const targetTenantId = isSuperAdmin && req.query.tenant_id
        ? req.query.tenant_id
        : tenantId;

      if (!targetTenantId) {
        return res.status(403).json({
          success: false,
          message: '无租户上下文',
          error_code: 'NO_TENANT_CONTEXT'
        });
      }

      // 查询订阅信息
      const result = await database.raw(`
        SELECT * FROM v_subscription_overview
        WHERE tenant_id = $1::uuid
        ORDER BY date_created DESC
      `, [targetTenantId]);

      const subscriptions = result.rows || [];

      res.json({
        success: true,
        data: {
          subscriptions,
          count: subscriptions.length
        }
      });
    } catch (error) {
      console.error('[BillingEndpoint] Error fetching subscriptions:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/billing/subscriptions
   * 创建新订阅（仅超级管理员）
   */
  router.post('/billing/subscriptions', async (req, res) => {
    try {
      const { isSuperAdmin } = req;

      if (!isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: '需要超级管理员权限'
        });
      }

      const {
        tenant_id,
        plan_type,
        billing_cycle,
        monthly_price,
        yearly_price
      } = req.body;

      if (!tenant_id || !plan_type) {
        return res.status(400).json({
          success: false,
          message: '请提供租户 ID 和套餐类型'
        });
      }

      // 检查是否已有活跃订阅
      const existingResult = await database.raw(`
        SELECT id FROM subscriptions
        WHERE tenant_id = $1::uuid AND status = 'active'
        LIMIT 1
      `, [tenant_id]);

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: '该租户已有活跃订阅'
        });
      }

      // 计算计费周期
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = billing_cycle === 'yearly'
        ? new Date(now.getFullYear() + 1, now.getMonth(), 1)
        : new Date(now.getFullYear(), now.getMonth() + 1, 1);

      // 创建订阅
      const insertResult = await database.raw(`
        INSERT INTO subscriptions (
          tenant_id, plan_type, billing_cycle,
          current_period_start, current_period_end,
          monthly_price, yearly_price, status
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'active')
        RETURNING id
      `, [
        tenant_id,
        plan_type,
        billing_cycle || 'monthly',
        periodStart.toISOString().split('T')[0],
        periodEnd.toISOString().split('T')[0],
        monthly_price || null,
        yearly_price || null
      ]);

      const subscriptionId = insertResult.rows[0].id;

      res.json({
        success: true,
        message: '订阅创建成功',
        subscription_id: subscriptionId
      });
    } catch (error) {
      console.error('[BillingEndpoint] Error creating subscription:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/billing/invoices
   * 获取租户的账单列表
   */
  router.get('/billing/invoices', async (req, res) => {
    try {
      const { tenantId, isSuperAdmin } = req;
      const { status, limit = 50, offset = 0 } = req.query;

      // 超级管理员可以查看所有租户
      const targetTenantId = isSuperAdmin && req.query.tenant_id
        ? req.query.tenant_id
        : tenantId;

      if (!targetTenantId) {
        return res.status(403).json({
          success: false,
          message: '无租户上下文',
          error_code: 'NO_TENANT_CONTEXT'
        });
      }

      // 构建查询
      let query = `
        SELECT
          i.id,
          i.invoice_number,
          i.amount_subtotal,
          i.amount_tax,
          i.amount_total,
          i.currency,
          i.status,
          i.due_date,
          i.paid_at,
          i.period_start,
          i.period_end,
          i.payment_method,
          i.date_created,
          s.plan_type,
          s.billing_cycle
        FROM invoices i
        LEFT JOIN subscriptions s ON s.id = i.subscription_id
        WHERE i.tenant_id = $1::uuid
      `;

      const params = [targetTenantId];
      let paramIndex = 2;

      if (status) {
        query += ` AND i.status = $${paramIndex++}`;
        params.push(status);
      }

      query += ` ORDER BY i.date_created DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await database.raw(query, params);

      res.json({
        success: true,
        data: {
          invoices: result.rows || [],
          count: result.rows?.length || 0
        }
      });
    } catch (error) {
      console.error('[BillingEndpoint] Error fetching invoices:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/billing/invoices
   * 生成账单（仅超级管理员）
   */
  router.post('/billing/invoices', async (req, res) => {
    try {
      const { isSuperAdmin } = req;

      if (!isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: '需要超级管理员权限'
        });
      }

      const {
        tenant_id,
        subscription_id,
        amount_subtotal,
        amount_tax,
        due_date,
        period_start,
        period_end,
        line_items
      } = req.body;

      if (!tenant_id || !amount_subtotal) {
        return res.status(400).json({
          success: false,
          message: '请提供租户 ID 和账单金额'
        });
      }

      // 生成账单编号
      const invoiceNumberResult = await database.raw(`
        SELECT generate_invoice_number($1::uuid) as invoice_number
      `, [tenant_id]);

      const invoiceNumber = invoiceNumberResult.rows[0].invoice_number;

      // 计算总金额
      const amountTotal = parseFloat(amount_subtotal) + parseFloat(amount_tax || 0);

      // 创建账单
      const insertResult = await database.raw(`
        INSERT INTO invoices (
          tenant_id,
          subscription_id,
          invoice_number,
          amount_subtotal,
          amount_tax,
          amount_total,
          status,
          due_date,
          period_start,
          period_end,
          line_items
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'open', $7, $8, $9, $10)
        RETURNING id
      `, [
        tenant_id,
        subscription_id || null,
        invoiceNumber,
        amount_subtotal,
        amount_tax || 0,
        amountTotal,
        due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 默认 30 天后
        period_start || new Date().toISOString().split('T')[0],
        period_end || new Date().toISOString().split('T')[0],
        JSON.stringify(line_items || [])
      ]);

      const invoiceId = insertResult.rows[0].id;

      res.json({
        success: true,
        message: '账单创建成功',
        invoice_id: invoiceId,
        invoice_number: invoiceNumber
      });
    } catch (error) {
      console.error('[BillingEndpoint] Error creating invoice:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * PATCH /gym/billing/invoices/:id/pay
   * 标记账单为已付款
   */
  router.patch('/billing/invoices/:id/pay', async (req, res) => {
    try {
      const { isSuperAdmin } = req;
      const { id } = req.params;
      const { payment_method, payment_transaction_id } = req.body;

      if (!isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: '需要超级管理员权限'
        });
      }

      // 更新账单状态
      await database.raw(`
        UPDATE invoices
        SET status = 'paid',
            paid_at = NOW(),
            payment_method = $1,
            payment_transaction_id = $2,
            date_updated = NOW()
        WHERE id = $3::uuid
      `, [payment_method || null, payment_transaction_id || null, id]);

      res.json({
        success: true,
        message: '账单已标记为已付款'
      });
    } catch (error) {
      console.error('[BillingEndpoint] Error marking invoice as paid:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/billing/usage-records
   * 获取租户的使用量记录
   */
  router.get('/billing/usage-records', async (req, res) => {
    try {
      const { tenantId, isSuperAdmin } = req;
      const { start_date, end_date, limit = 30 } = req.query;

      // 超级管理员可以查看所有租户
      const targetTenantId = isSuperAdmin && req.query.tenant_id
        ? req.query.tenant_id
        : tenantId;

      if (!targetTenantId) {
        return res.status(403).json({
          success: false,
          message: '无租户上下文',
          error_code: 'NO_TENANT_CONTEXT'
        });
      }

      // 默认查询最近 30 天
      const endDate = end_date || new Date().toISOString().split('T')[0];
      const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const result = await database.raw(`
        SELECT *
        FROM usage_records
        WHERE tenant_id = $1::uuid
          AND record_date >= $2::date
          AND record_date <= $3::date
        ORDER BY record_date DESC
        LIMIT $4
      `, [targetTenantId, startDate, endDate, parseInt(limit)]);

      res.json({
        success: true,
        data: {
          records: result.rows || [],
          period: {
            start: startDate,
            end: endDate
          }
        }
      });
    } catch (error) {
      console.error('[BillingEndpoint] Error fetching usage records:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/billing/usage-records/collect
   * 收集并记录今日使用量（仅超级管理员，通常由定时任务调用）
   */
  router.post('/billing/usage-records/collect', async (req, res) => {
    try {
      const { isSuperAdmin } = req;

      if (!isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: '需要超级管理员权限'
        });
      }

      const { tenant_id } = req.body;

      // 如果指定租户 ID，只收集该租户；否则收集所有租户
      const tenantsResult = tenant_id
        ? await database.raw('SELECT id FROM tenants WHERE id = $1::uuid', [tenant_id])
        : await database.raw('SELECT id FROM tenants WHERE tenant_status = \'active\'');

      const tenants = tenantsResult.rows || [];
      let collected = 0;

      for (const tenant of tenants) {
        // 获取租户的当前使用量
        const statsResult = await database.raw(`
          SELECT
            (SELECT COUNT(*) FROM branches WHERE tenant_id = $1::uuid AND status = 'active') as branches_count,
            (SELECT COUNT(*) FROM members m
             INNER JOIN branches b ON b.id = m.branch_id
             WHERE b.tenant_id = $1::uuid AND m.member_status IN ('active', 'inactive', 'frozen')) as members_count,
            (SELECT COUNT(*) FROM employees e
             INNER JOIN branches b ON b.id = e.branch_id
             WHERE b.tenant_id = $1::uuid AND e.status = 'active') as employees_count,
            (SELECT COUNT(*) FROM contracts c
             INNER JOIN members m ON m.id = c.member_id
             INNER JOIN branches b ON b.id = m.branch_id
             WHERE b.tenant_id = $1::uuid AND c.contract_status = 'ACTIVE') as active_contracts_count
        `, [tenant.id]);

        const stats = statsResult.rows[0];

        // 插入或更新使用量记录
        await database.raw(`
          INSERT INTO usage_records (
            tenant_id,
            record_date,
            members_count,
            employees_count,
            branches_count,
            active_contracts_count
          ) VALUES ($1::uuid, CURRENT_DATE, $2, $3, $4, $5)
          ON CONFLICT (tenant_id, record_date)
          DO UPDATE SET
            members_count = EXCLUDED.members_count,
            employees_count = EXCLUDED.employees_count,
            branches_count = EXCLUDED.branches_count,
            active_contracts_count = EXCLUDED.active_contracts_count,
            date_created = NOW()
        `, [
          tenant.id,
          stats.members_count || 0,
          stats.employees_count || 0,
          stats.branches_count || 0,
          stats.active_contracts_count || 0
        ]);

        collected++;
      }

      res.json({
        success: true,
        message: `成功收集 ${collected} 个租户的使用量数据`,
        collected_count: collected
      });
    } catch (error) {
      console.error('[BillingEndpoint] Error collecting usage records:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/billing/invoices/:id/pdf
   * 下载发票 PDF
   */
  router.get('/billing/invoices/:id/pdf', async (req, res) => {
    try {
      const { tenantId, isSuperAdmin } = req;
      const { id } = req.params;

      // 查询发票信息
      const invoiceResult = await database.raw(`
        SELECT
          i.*,
          s.plan_type,
          s.billing_cycle
        FROM invoices i
        LEFT JOIN subscriptions s ON s.id = i.subscription_id
        WHERE i.id = $1::uuid
      `, [id]);

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: '发票不存在'
        });
      }

      const invoice = invoiceResult.rows[0];

      // 权限检查：只能查看自己租户的发票
      if (!isSuperAdmin && invoice.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          message: '无权限访问此发票'
        });
      }

      // 获取租户信息
      const tenantResult = await database.raw(`
        SELECT name, email, phone
        FROM tenants
        WHERE id = $1::uuid
      `, [invoice.tenant_id]);

      if (tenantResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: '租户不存在'
        });
      }

      const tenant = tenantResult.rows[0];

      // 生成 PDF
      const pdfGenerator = new PDFGenerator();
      const pdfBuffer = await pdfGenerator.generateInvoicePDF(invoice, tenant);

      // 设置响应头
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      res.send(pdfBuffer);
    } catch (error) {
      console.error('[BillingEndpoint] Error generating invoice PDF:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerBillingRoutes;
