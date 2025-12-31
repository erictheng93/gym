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
}

export default registerAdminRoutes;
