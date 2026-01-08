/**
 * Admin Routes
 * /gym/admin/*
 */

/**
 * 註冊管理員路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} adminNotificationMiddleware - 管理員通知中間件
 */
export function registerAdminRoutes(router, context, adminNotificationMiddleware) {
  const { database, env } = context;

  /**
   * GET /gym/admin/tenants
   * 獲取所有租戶列表（需要管理員權限）
   */
  router.get('/admin/tenants', async (req, res) => {
    try {
      const { accountability } = req;

      // 只允許管理員訪問
      if (!accountability || !accountability.admin) {
        return res.status(403).json({
          success: false,
          message: '需要管理員權限'
        });
      }

      // 檢查 v_tenant_overview 視圖是否存在
      const viewExists = await database.raw(`
        SELECT EXISTS (
          SELECT FROM information_schema.views
          WHERE table_schema = 'public'
          AND table_name = 'v_tenant_overview'
        ) as exists
      `);

      let tenants;

      if (viewExists.rows[0].exists) {
        // 使用視圖獲取完整數據
        const result = await database.raw(`
          SELECT * FROM v_tenant_overview
          ORDER BY name
        `);
        tenants = result.rows;
      } else {
        // 視圖不存在，使用基本查詢
        const result = await database.raw(`
          SELECT
            id,
            name,
            slug,
            email,
            plan_type,
            tenant_status,
            max_branches,
            max_members,
            max_employees,
            trial_ends_at,
            date_created,
            0 as current_branches,
            0 as current_members,
            0 as current_employees,
            0 as branches_usage_percent,
            0 as members_usage_percent,
            0 as employees_usage_percent,
            0 as active_contracts
          FROM tenants
          ORDER BY name
        `);
        tenants = result.rows;
      }

      // 計算總體統計
      const stats = {
        totalTenants: tenants.length,
        activeTenants: tenants.filter(t => t.tenant_status === 'active').length,
        trialTenants: tenants.filter(t => t.tenant_status === 'trial').length,
        suspendedTenants: tenants.filter(t => t.tenant_status === 'suspended').length,
        tenantsAtRisk: tenants.filter(t =>
          t.members_usage_percent >= 90 ||
          t.employees_usage_percent >= 90 ||
          t.branches_usage_percent >= 90
        ).length,
        totalMembers: tenants.reduce((sum, t) => sum + (parseInt(t.current_members) || 0), 0),
        totalEmployees: tenants.reduce((sum, t) => sum + (parseInt(t.current_employees) || 0), 0),
        totalBranches: tenants.reduce((sum, t) => sum + (parseInt(t.current_branches) || 0), 0)
      };

      res.json({
        success: true,
        stats,
        tenants
      });
    } catch (error) {
      console.error('[AdminEndpoint] Error fetching tenants:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });

  /**
   * POST /gym/admin/tenants
   * 創建新租戶
   */
  router.post('/admin/tenants', async (req, res) => {
    try {
      const { accountability } = req;

      if (!accountability || !accountability.admin) {
        return res.status(403).json({
          success: false,
          message: '需要管理員權限'
        });
      }

      const {
        name,
        slug,
        email,
        phone,
        plan_type,
        billing_cycle,
        max_members,
        max_employees,
        max_branches,
        trial_days
      } = req.body;

      // 驗證必填欄位
      if (!name || !slug || !email) {
        return res.status(400).json({
          success: false,
          message: '請提供租戶名稱、標識符和電子郵件'
        });
      }

      // 檢查 slug 是否已存在
      const existingTenant = await database.raw(`
        SELECT id FROM tenants WHERE slug = ? LIMIT 1
      `, [slug]);

      if (existingTenant.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: '租戶標識符已存在'
        });
      }

      // 計算試用結束日期
      let trialEndsAt = null;
      if (trial_days && trial_days > 0) {
        const date = new Date();
        date.setDate(date.getDate() + trial_days);
        trialEndsAt = date.toISOString();
      }

      // 創建租戶
      const insertResult = await database.raw(`
        INSERT INTO tenants (
          name, slug, email, phone, plan_type, billing_cycle,
          max_members, max_employees, max_branches,
          tenant_status, trial_ends_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        name,
        slug,
        email,
        phone || null,
        plan_type || 'starter',
        billing_cycle || 'monthly',
        max_members || 100,
        max_employees || 10,
        max_branches || 1,
        trial_days > 0 ? 'trial' : 'active',
        trialEndsAt
      ]);

      const tenantId = insertResult.rows[0].id;

      res.json({
        success: true,
        message: '租戶創建成功',
        tenant_id: tenantId
      });
    } catch (error) {
      console.error('[AdminEndpoint] Error creating tenant:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });

  /**
   * GET /gym/admin/tenants/:id
   * 獲取指定租戶的詳細信息
   */
  router.get('/admin/tenants/:id', async (req, res) => {
    try {
      const { accountability } = req;
      const { id } = req.params;

      if (!accountability || !accountability.admin) {
        return res.status(403).json({
          success: false,
          message: '需要管理員權限'
        });
      }

      // 獲取租戶基本信息
      const tenantResult = await database.raw(`
        SELECT * FROM tenants WHERE id = ? LIMIT 1
      `, [id]);

      const tenant = tenantResult.rows?.[0];
      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: '找不到租戶'
        });
      }

      // 獲取分店列表
      const branchesResult = await database.raw(`
        SELECT id, name, address, status, date_created
        FROM branches
        WHERE tenant_id = ?
        ORDER BY name
      `, [id]);

      // 獲取使用量統計
      const usageResult = await database.raw(`
        SELECT
          (SELECT COUNT(*) FROM branches WHERE tenant_id = ? AND status = 'active') as current_branches,
          (SELECT COUNT(*) FROM members m
           INNER JOIN branches b ON b.id = m.branch_id
           WHERE b.tenant_id = ? AND m.status = 'active') as current_members,
          (SELECT COUNT(*) FROM employees e
           INNER JOIN branches b ON b.id = e.branch_id
           WHERE b.tenant_id = ? AND e.status = 'active') as current_employees,
          (SELECT COUNT(*) FROM contracts c
           INNER JOIN members m ON m.id = c.member_id
           INNER JOIN branches b ON b.id = m.branch_id
           WHERE b.tenant_id = ? AND c.contract_status = 'ACTIVE') as active_contracts
      `, [id, id, id, id]);

      const usage = usageResult.rows[0];

      // 獲取最近活動
      const recentActivityResult = await database.raw(`
        SELECT
          m.id,
          m.full_name,
          m.member_code,
          m.date_created,
          b.name as branch_name,
          'member' as type
        FROM members m
        INNER JOIN branches b ON b.id = m.branch_id
        WHERE b.tenant_id = ?
        ORDER BY m.date_created DESC
        LIMIT 10
      `, [id]);

      res.json({
        success: true,
        tenant: {
          ...tenant,
          usage: {
            branches: {
              current: parseInt(usage.current_branches) || 0,
              limit: tenant.max_branches,
              percent: tenant.max_branches > 0
                ? Math.round((usage.current_branches / tenant.max_branches) * 100)
                : 0
            },
            members: {
              current: parseInt(usage.current_members) || 0,
              limit: tenant.max_members,
              percent: tenant.max_members > 0
                ? Math.round((usage.current_members / tenant.max_members) * 100)
                : 0
            },
            employees: {
              current: parseInt(usage.current_employees) || 0,
              limit: tenant.max_employees,
              percent: tenant.max_employees > 0
                ? Math.round((usage.current_employees / tenant.max_employees) * 100)
                : 0
            },
            activeContracts: parseInt(usage.active_contracts) || 0
          },
          branches: branchesResult.rows,
          recentActivity: recentActivityResult.rows
        }
      });
    } catch (error) {
      console.error('[AdminEndpoint] Error fetching tenant details:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });

  /**
   * PATCH /gym/admin/tenants/:id
   * 更新租戶信息
   */
  router.patch('/admin/tenants/:id', async (req, res) => {
    try {
      const { accountability } = req;
      const { id } = req.params;

      if (!accountability || !accountability.admin) {
        return res.status(403).json({
          success: false,
          message: '需要管理員權限'
        });
      }

      const {
        name,
        email,
        phone,
        max_members,
        max_employees,
        max_branches,
        billing_cycle
      } = req.body;

      // 構建更新欄位
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(name);
      }
      if (email !== undefined) {
        updates.push(`email = $${paramIndex++}`);
        values.push(email);
      }
      if (phone !== undefined) {
        updates.push(`phone = $${paramIndex++}`);
        values.push(phone);
      }
      if (max_members !== undefined) {
        updates.push(`max_members = $${paramIndex++}`);
        values.push(max_members);
      }
      if (max_employees !== undefined) {
        updates.push(`max_employees = $${paramIndex++}`);
        values.push(max_employees);
      }
      if (max_branches !== undefined) {
        updates.push(`max_branches = $${paramIndex++}`);
        values.push(max_branches);
      }
      if (billing_cycle !== undefined) {
        updates.push(`billing_cycle = $${paramIndex++}`);
        values.push(billing_cycle);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: '沒有提供要更新的欄位'
        });
      }

      // 添加 date_updated
      updates.push(`date_updated = $${paramIndex++}`);
      values.push(new Date().toISOString());

      // 添加 ID 到參數列表
      values.push(id);

      // 執行更新
      await database.raw(`
        UPDATE tenants
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}::uuid
      `, values);

      res.json({
        success: true,
        message: '租戶信息已更新'
      });
    } catch (error) {
      console.error('[AdminEndpoint] Error updating tenant:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });

  /**
   * PATCH /gym/admin/tenants/:id/status
   * 切換租戶狀態
   */
  router.patch('/admin/tenants/:id/status', async (req, res) => {
    try {
      const { accountability } = req;
      const { id } = req.params;
      const { status } = req.body;

      if (!accountability || !accountability.admin) {
        return res.status(403).json({
          success: false,
          message: '需要管理員權限'
        });
      }

      // 驗證狀態值
      const validStatuses = ['trial', 'active', 'suspended', 'cancelled'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: '無效的狀態值'
        });
      }

      // 更新狀態
      await database.raw(`
        UPDATE tenants
        SET tenant_status = ?,
            date_updated = ?
        WHERE id = ?::uuid
      `, [status, new Date().toISOString(), id]);

      res.json({
        success: true,
        message: '租戶狀態已更新'
      });
    } catch (error) {
      console.error('[AdminEndpoint] Error changing tenant status:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });

  /**
   * GET /gym/admin/notification-config
   */
  router.get('/admin/notification-config', adminNotificationMiddleware, async (req, res) => {
    try {
      const branchId = req.query.branch_id || req.adminBranchId;

      if (!branchId && req.adminBranchId !== null) {
        return res.status(400).json({ success: false, message: '請指定分店' });
      }

      let result;
      if (branchId) {
        result = await database.raw(`
          SELECT bnc.*, b.name as branch_name
          FROM branch_notification_config bnc
          RIGHT JOIN branches b ON b.id = bnc.branch_id
          WHERE b.id = ?::uuid
        `, [branchId]);
      } else {
        result = await database.raw(`
          SELECT b.id as branch_id, b.name as branch_name, bnc.id as config_id,
            bnc.line_channel_access_token IS NOT NULL as has_line_config,
            bnc.mitake_username IS NOT NULL as has_sms_config,
            bnc.is_active, bnc.date_updated
          FROM branches b
          LEFT JOIN branch_notification_config bnc ON bnc.branch_id = b.id
          WHERE b.status = 'active' ORDER BY b.name
        `);
        return res.json({ success: true, branches: result.rows });
      }

      const config = result.rows?.[0];
      res.json({
        success: true,
        config: {
          branch_id: branchId,
          branch_name: config?.branch_name,
          has_line_config: !!config?.line_channel_access_token,
          has_sms_config: !!config?.mitake_username,
          sms_sender_name: config?.sms_sender_name,
          is_active: config?.is_active ?? true,
        },
      });
    } catch (error) {
      console.error('[GymEndpoint] Get notification config error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * PATCH /gym/admin/notification-config
   */
  router.patch('/admin/notification-config', adminNotificationMiddleware, async (req, res) => {
    try {
      const branchId = req.body.branch_id || req.adminBranchId;

      if (!branchId) {
        return res.status(400).json({ success: false, message: '請指定分店' });
      }

      if (req.adminBranchId && req.adminBranchId !== branchId) {
        return res.status(403).json({ success: false, message: '無權限修改其他分店設定' });
      }

      const {
        line_channel_access_token,
        line_channel_secret,
        mitake_username,
        mitake_password,
        sms_sender_name,
        is_active,
      } = req.body;

      const updates = {};
      if (line_channel_access_token !== undefined) updates.line_channel_access_token = line_channel_access_token || null;
      if (line_channel_secret !== undefined) updates.line_channel_secret = line_channel_secret || null;
      if (mitake_username !== undefined) updates.mitake_username = mitake_username || null;
      if (mitake_password !== undefined) updates.mitake_password = mitake_password || null;
      if (sms_sender_name !== undefined) updates.sms_sender_name = sms_sender_name || null;
      if (is_active !== undefined) updates.is_active = is_active;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: '請提供要更新的欄位' });
      }

      updates.date_updated = new Date().toISOString();

      const existingResult = await database.raw(`
        SELECT id FROM branch_notification_config WHERE branch_id = ?::uuid
      `, [branchId]);

      if (existingResult.rows?.length > 0) {
        const setClauses = Object.keys(updates).map((key, i) => `${key} = $${i + 2}`);
        await database.raw(`
          UPDATE branch_notification_config SET ${setClauses.join(', ')} WHERE branch_id = $1::uuid
        `, [branchId, ...Object.values(updates)]);
      } else {
        const columns = ['branch_id', ...Object.keys(updates)];
        const values = [branchId, ...Object.values(updates)];
        const placeholders = values.map((_, i) => `$${i + 1}`);
        await database.raw(`
          INSERT INTO branch_notification_config (${columns.join(', ')}) VALUES (${placeholders.join(', ')})
        `, values);
      }

      res.json({ success: true, message: '通知設定已更新' });
    } catch (error) {
      console.error('[GymEndpoint] Update notification config error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * POST /gym/admin/notification-config/test
   */
  router.post('/admin/notification-config/test', adminNotificationMiddleware, async (req, res) => {
    try {
      const branchId = req.body.branch_id || req.adminBranchId;
      const { channel } = req.body;

      if (!branchId) {
        return res.status(400).json({ success: false, message: '請指定分店' });
      }

      if (!channel || !['line', 'sms'].includes(channel)) {
        return res.status(400).json({ success: false, message: '請指定測試通道 (line 或 sms)' });
      }

      const configResult = await database.raw(`
        SELECT * FROM branch_notification_config WHERE branch_id = ?::uuid
      `, [branchId]);

      const config = configResult.rows?.[0];

      if (channel === 'line') {
        const token = config?.line_channel_access_token || env.LINE_CHANNEL_ACCESS_TOKEN;
        if (!token) {
          return res.json({ success: false, channel: 'line', message: '未設定 LINE Channel Access Token' });
        }

        try {
          const response = await fetch('https://api.line.me/v2/bot/info', {
            headers: { 'Authorization': `Bearer ${token}` },
          });

          if (response.ok) {
            const botInfo = await response.json();
            return res.json({
              success: true,
              channel: 'line',
              message: 'LINE 設定有效',
              details: { botName: botInfo.displayName, botUserId: botInfo.userId },
            });
          } else {
            return res.json({ success: false, channel: 'line', message: 'LINE Token 無效' });
          }
        } catch (lineError) {
          return res.json({ success: false, channel: 'line', message: `LINE API 錯誤: ${lineError.message}` });
        }
      }

      if (channel === 'sms') {
        const username = config?.mitake_username || env.MITAKE_USERNAME;
        if (!username) {
          return res.json({ success: false, channel: 'sms', message: '未設定三竹簡訊帳號' });
        }
        return res.json({
          success: true,
          channel: 'sms',
          message: '三竹簡訊設定已配置',
          details: { username },
        });
      }
    } catch (error) {
      console.error('[GymEndpoint] Test notification config error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * GET /gym/admin/notification-usage
   */
  router.get('/admin/notification-usage', adminNotificationMiddleware, async (req, res) => {
    try {
      const branchId = req.query.branch_id || req.adminBranchId;
      const { start_date, end_date, group_by = 'day' } = req.query;

      const now = new Date();
      const startDate = start_date || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endDate = end_date || now.toISOString().split('T')[0];

      let smsQuery = `
        SELECT
          ${group_by === 'day' ? "DATE(date_created) as period" : "DATE_TRUNC('month', date_created) as period"},
          COUNT(*) as total_sent,
          COUNT(*) FILTER (WHERE status = 'sent') as success_count,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
          SUM(COALESCE(cost, 0)) as total_cost,
          SUM(segments) as total_segments
        FROM sms_logs
        WHERE date_created >= ?::date AND date_created < (?::date + INTERVAL '1 day')
      `;
      const smsParams = [startDate, endDate];

      if (branchId) {
        smsQuery += ` AND branch_id = ?::uuid`;
        smsParams.push(branchId);
      }
      smsQuery += ` GROUP BY period ORDER BY period DESC`;

      const smsResult = await database.raw(smsQuery, smsParams);

      res.json({
        success: true,
        period: { start_date: startDate, end_date: endDate },
        sms_usage: smsResult.rows || [],
      });
    } catch (error) {
      console.error('[GymEndpoint] Notification usage error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * GET /gym/admin/notification-usage/export
   */
  router.get('/admin/notification-usage/export', adminNotificationMiddleware, async (req, res) => {
    try {
      const branchId = req.query.branch_id || req.adminBranchId;
      const { start_date, end_date, format = 'csv' } = req.query;

      const now = new Date();
      const startDate = start_date || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endDate = end_date || now.toISOString().split('T')[0];

      let query = `
        SELECT sl.date_created, b.name as branch_name, m.full_name as member_name,
          sl.phone_number, sl.message_type, sl.status, sl.segments, sl.cost, sl.provider_message_id
        FROM sms_logs sl
        LEFT JOIN branches b ON b.id = sl.branch_id
        LEFT JOIN members m ON m.id = sl.member_id
        WHERE sl.date_created >= ?::date AND sl.date_created < (?::date + INTERVAL '1 day')
      `;
      const params = [startDate, endDate];

      if (branchId) {
        query += ` AND sl.branch_id = ?::uuid`;
        params.push(branchId);
      }
      query += ` ORDER BY sl.date_created DESC`;

      const result = await database.raw(query, params);
      const rows = result.rows || [];

      if (format === 'csv') {
        const headers = ['日期時間', '分店', '會員', '電話', '類型', '狀態', '則數', '費用', '訊息ID'];
        const csvRows = [headers.join(',')];

        for (const row of rows) {
          csvRows.push([
            row.date_created, row.branch_name || '', row.member_name || '',
            row.phone_number || '', row.message_type || '', row.status || '',
            row.segments || 0, row.cost || 0, row.provider_message_id || '',
          ].join(','));
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=sms-usage-${startDate}-${endDate}.csv`);
        res.send('\ufeff' + csvRows.join('\n'));
      } else {
        res.json({ success: true, data: rows });
      }
    } catch (error) {
      console.error('[GymEndpoint] Export notification usage error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * GET /gym/admin/member-analytics/status-distribution
   * 获取会员状态分布
   */
  router.get('/admin/member-analytics/status-distribution', async (req, res) => {
    try {
      const { tenantId } = req;

      const result = await database.raw(`
        SELECT
          status,
          COUNT(*)::INTEGER as count
        FROM members
        WHERE branch_id IN (
          SELECT id FROM branches WHERE tenant_id = $1::uuid
        )
        GROUP BY status
        ORDER BY count DESC
      `, [tenantId]);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('[Admin] Error fetching member status distribution:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * GET /gym/admin/member-analytics/contract-distribution
   * 获取合约类型分布
   */
  router.get('/admin/member-analytics/contract-distribution', async (req, res) => {
    try {
      const { tenantId } = req;

      const result = await database.raw(`
        SELECT
          c.contract_type as type,
          COUNT(*)::INTEGER as count
        FROM contracts c
        INNER JOIN members m ON m.id = c.member_id
        WHERE m.branch_id IN (
          SELECT id FROM branches WHERE tenant_id = $1::uuid
        )
          AND c.status = 'active'
        GROUP BY c.contract_type
        ORDER BY count DESC
      `, [tenantId]);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('[Admin] Error fetching contract distribution:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * GET /gym/admin/member-analytics/age-distribution
   * 获取会员年龄分布
   */
  router.get('/admin/member-analytics/age-distribution', async (req, res) => {
    try {
      const { tenantId } = req;

      const result = await database.raw(`
        SELECT
          CASE
            WHEN EXTRACT(YEAR FROM AGE(birth_date)) < 18 THEN '18岁以下'
            WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 18 AND 25 THEN '18-25岁'
            WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 26 AND 35 THEN '26-35岁'
            WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 36 AND 45 THEN '36-45岁'
            WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 46 AND 55 THEN '46-55岁'
            WHEN EXTRACT(YEAR FROM AGE(birth_date)) > 55 THEN '55岁以上'
            ELSE '未知'
          END as age_range,
          COUNT(*)::INTEGER as count
        FROM members
        WHERE branch_id IN (
          SELECT id FROM branches WHERE tenant_id = $1::uuid
        )
          AND birth_date IS NOT NULL
        GROUP BY age_range
        ORDER BY
          CASE age_range
            WHEN '18岁以下' THEN 1
            WHEN '18-25岁' THEN 2
            WHEN '26-35岁' THEN 3
            WHEN '36-45岁' THEN 4
            WHEN '46-55岁' THEN 5
            WHEN '55岁以上' THEN 6
            ELSE 7
          END
      `, [tenantId]);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('[Admin] Error fetching age distribution:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * GET /gym/admin/member-analytics/top-plans
   * 获取热门会籍套餐
   */
  router.get('/admin/member-analytics/top-plans', async (req, res) => {
    try {
      const { tenantId } = req;

      const result = await database.raw(`
        SELECT
          mp.id,
          mp.name,
          COUNT(c.id)::INTEGER as member_count,
          ROUND(COUNT(c.id)::DECIMAL / NULLIF((
            SELECT COUNT(*) FROM contracts c2
            INNER JOIN members m2 ON m2.id = c2.member_id
            WHERE m2.branch_id IN (
              SELECT id FROM branches WHERE tenant_id = $1::uuid
            )
              AND c2.status = 'active'
          ), 0) * 100, 1) as percentage,
          SUM(CASE
            WHEN mp.billing_cycle = 'monthly' THEN mp.price
            WHEN mp.billing_cycle = 'quarterly' THEN mp.price / 3
            WHEN mp.billing_cycle = 'yearly' THEN mp.price / 12
            ELSE 0
          END)::DECIMAL(10,2) as monthly_revenue
        FROM membership_plans mp
        LEFT JOIN contracts c ON c.membership_plan_id = mp.id AND c.status = 'active'
        LEFT JOIN members m ON m.id = c.member_id
        WHERE m.branch_id IN (
          SELECT id FROM branches WHERE tenant_id = $1::uuid
        )
        GROUP BY mp.id, mp.name
        HAVING COUNT(c.id) > 0
        ORDER BY member_count DESC
        LIMIT 10
      `, [tenantId]);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      console.error('[Admin] Error fetching top plans:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * GET /gym/admin/member-analytics/churn
   * 获取会员流失数据
   */
  router.get('/admin/member-analytics/churn', async (req, res) => {
    try {
      const { tenantId } = req;
      const days = parseInt(req.query.days) || 30;

      const result = await database.raw(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'inactive' AND date_updated >= NOW() - INTERVAL '${days} days')::INTEGER as churned_count,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'inactive' AND date_updated >= NOW() - INTERVAL '${days} days')::DECIMAL /
            NULLIF(COUNT(*), 0) * 100,
            2
          ) as churn_rate
        FROM members
        WHERE branch_id IN (
          SELECT id FROM branches WHERE tenant_id = $1::uuid
        )
      `, [tenantId]);

      res.json({
        success: true,
        data: result.rows[0] || { churned_count: 0, churn_rate: 0 }
      });
    } catch (error) {
      console.error('[Admin] Error fetching churn data:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  /**
   * GET /gym/admin/member-analytics/export
   * 导出会员分析数据
   */
  router.get('/admin/member-analytics/export', async (req, res) => {
    try {
      const { tenantId } = req;
      const timeRange = req.query.timeRange || '30d';
      const format = req.query.format || 'csv';

      // Get member data
      const result = await database.raw(`
        SELECT
          m.id,
          m.name,
          m.email,
          m.phone,
          m.status,
          m.date_created,
          m.birth_date,
          b.name as branch_name,
          COUNT(c.id) as contract_count,
          SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) as active_contracts
        FROM members m
        INNER JOIN branches b ON b.id = m.branch_id
        LEFT JOIN contracts c ON c.member_id = m.id
        WHERE b.tenant_id = $1::uuid
        GROUP BY m.id, m.name, m.email, m.phone, m.status, m.date_created, m.birth_date, b.name
        ORDER BY m.date_created DESC
      `, [tenantId]);

      if (format === 'csv') {
        const headers = ['ID', '姓名', '邮箱', '电话', '状态', '创建日期', '出生日期', '分店', '合约数', '活跃合约数'];
        const csvRows = [headers.join(',')];

        result.rows.forEach(row => {
          csvRows.push([
            row.id,
            row.name || '',
            row.email || '',
            row.phone || '',
            row.status || '',
            row.date_created || '',
            row.birth_date || '',
            row.branch_name || '',
            row.contract_count || 0,
            row.active_contracts || 0
          ].join(','));
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="member-analytics-${timeRange}.csv"`);
        res.send('\ufeff' + csvRows.join('\n'));
      } else {
        res.json({
          success: true,
          data: result.rows
        });
      }
    } catch (error) {
      console.error('[Admin] Error exporting member analytics:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
}

export default registerAdminRoutes;
