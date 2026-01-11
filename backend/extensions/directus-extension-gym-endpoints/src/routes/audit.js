/**
 * Audit Log Routes
 * /gym/audit/*
 * 审计日志管理端点
 */

/**
 * 注册审计日志路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerAuditRoutes(router, context) {
  const { database } = context;

  /**
   * GET /gym/audit/logs
   * 获取审计日志列表
   */
  router.get('/audit/logs', async (req, res) => {
    try {
      const { tenantId, isSuperAdmin, userId, employeeId } = req;
      const {
        action,
        resource_type,
        severity,
        start_date,
        end_date,
        limit = 100,
        offset = 0
      } = req.query;

      // 普通用户只能查看自己租户的日志
      const targetTenantId = isSuperAdmin && req.query.tenant_id
        ? req.query.tenant_id
        : tenantId;

      // 构建查询
      let query = `
        SELECT * FROM v_audit_logs_summary
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      // 租户过滤
      if (targetTenantId) {
        query += ` AND tenant_id = $${paramIndex++}::uuid`;
        params.push(targetTenantId);
      } else if (!isSuperAdmin) {
        // 非管理员必须有租户上下文
        return res.status(403).json({
          success: false,
          message: '无租户上下文',
          error_code: 'NO_TENANT_CONTEXT'
        });
      }

      // 操作类型过滤
      if (action) {
        query += ` AND action = $${paramIndex++}`;
        params.push(action);
      }

      // 资源类型过滤
      if (resource_type) {
        query += ` AND resource_type = $${paramIndex++}`;
        params.push(resource_type);
      }

      // 严重程度过滤
      if (severity) {
        query += ` AND severity = $${paramIndex++}`;
        params.push(severity);
      }

      // 日期范围过滤
      if (start_date) {
        query += ` AND date_created >= $${paramIndex++}::date`;
        params.push(start_date);
      }

      if (end_date) {
        query += ` AND date_created <= ($${paramIndex++}::date + INTERVAL '1 day')`;
        params.push(end_date);
      }

      // 排序和分页
      query += ` ORDER BY date_created DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await database.raw(query, params);

      res.json({
        success: true,
        data: {
          logs: result.rows || [],
          count: result.rows?.length || 0,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      // Error logged('[AuditEndpoint] Error fetching logs:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/audit/logs/:id
   * 获取单个审计日志详情
   */
  router.get('/audit/logs/:id', async (req, res) => {
    try {
      const { tenantId, isSuperAdmin } = req;
      const { id } = req.params;

      const result = await database.raw(`
        SELECT * FROM audit_logs
        WHERE id = $1::uuid
        LIMIT 1
      `, [id]);

      const log = result.rows?.[0];

      if (!log) {
        return res.status(404).json({
          success: false,
          message: '找不到审计日志'
        });
      }

      // 权限检查：非管理员只能查看自己租户的日志
      if (!isSuperAdmin && log.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          message: '权限不足'
        });
      }

      res.json({
        success: true,
        data: log
      });
    } catch (error) {
      // Error logged('[AuditEndpoint] Error fetching log detail:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/audit/logs
   * 创建审计日志（供内部使用）
   */
  router.post('/audit/logs', async (req, res) => {
    try {
      const { tenantId, userId, employeeId } = req;
      const {
        action,
        resource_type,
        resource_id,
        description,
        old_values,
        new_values,
        severity = 'info',
        category,
        metadata = {}
      } = req.body;

      if (!action || !resource_type) {
        return res.status(400).json({
          success: false,
          message: '请提供操作类型和资源类型'
        });
      }

      // 获取请求信息
      const ip_address = req.ip || req.connection.remoteAddress;
      const user_agent = req.get('user-agent');

      // 调用存储过程创建审计日志
      const result = await database.raw(`
        SELECT create_audit_log(
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4,
          $5,
          $6::uuid,
          $7,
          $8,
          $9,
          $10
        ) as audit_id
      `, [
        tenantId || null,
        userId || null,
        employeeId || null,
        action,
        resource_type,
        resource_id || null,
        description || null,
        old_values ? JSON.stringify(old_values) : null,
        new_values ? JSON.stringify(new_values) : null,
        JSON.stringify(metadata)
      ]);

      const auditId = result.rows[0].audit_id;

      // 更新额外字段
      await database.raw(`
        UPDATE audit_logs
        SET ip_address = $1::inet,
            user_agent = $2,
            severity = $3,
            category = $4
        WHERE id = $5::uuid
      `, [
        ip_address || null,
        user_agent || null,
        severity,
        category || null,
        auditId
      ]);

      res.json({
        success: true,
        message: '审计日志创建成功',
        audit_id: auditId
      });
    } catch (error) {
      // Error logged('[AuditEndpoint] Error creating log:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/audit/stats
   * 获取审计日志统计数据
   */
  router.get('/audit/stats', async (req, res) => {
    try {
      const { tenantId, isSuperAdmin } = req;
      const { start_date, end_date, group_by = 'action' } = req.query;

      // 超级管理员可以查看所有租户
      const targetTenantId = isSuperAdmin && req.query.tenant_id
        ? req.query.tenant_id
        : tenantId;

      if (!targetTenantId && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: '无租户上下文',
          error_code: 'NO_TENANT_CONTEXT'
        });
      }

      // 默认查询最近 30 天
      const endDate = end_date || new Date().toISOString().split('T')[0];
      const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      let groupByClause;
      switch (group_by) {
        case 'action':
          groupByClause = 'action';
          break;
        case 'resource_type':
          groupByClause = 'resource_type';
          break;
        case 'severity':
          groupByClause = 'severity';
          break;
        case 'user':
          groupByClause = 'employee_id, employee_name';
          break;
        case 'day':
          groupByClause = 'DATE(date_created)';
          break;
        default:
          groupByClause = 'action';
      }

      let query = `
        SELECT
          ${groupByClause} as group_key,
      `;

      // 如果按员工分组，添加员工名称
      if (group_by === 'user') {
        query += `
          employee_id,
          employee_name,
        `;
      }

      query += `
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE response_status >= 200 AND response_status < 400) as success_count,
          COUNT(*) FILTER (WHERE response_status >= 400) as failed_count,
          COUNT(*) FILTER (WHERE severity = 'error' OR severity = 'critical') as error_count,
          ROUND(AVG(response_time_ms)::NUMERIC, 2) as avg_response_time_ms
        FROM v_audit_logs_summary
        WHERE date_created >= $1::date
          AND date_created <= ($2::date + INTERVAL '1 day')
      `;

      const params = [startDate, endDate];
      let paramIndex = 3;

      if (targetTenantId) {
        query += ` AND tenant_id = $${paramIndex++}::uuid`;
        params.push(targetTenantId);
      }

      query += ` GROUP BY ${groupByClause}
        ORDER BY total_count DESC
        LIMIT 50
      `;

      const result = await database.raw(query, params);

      res.json({
        success: true,
        data: {
          stats: result.rows || [],
          period: {
            start: startDate,
            end: endDate
          },
          group_by
        }
      });
    } catch (error) {
      // Error logged('[AuditEndpoint] Error fetching stats:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/audit/export
   * 导出审计日志（CSV 格式）
   */
  router.get('/audit/export', async (req, res) => {
    try {
      const { tenantId, isSuperAdmin } = req;
      const { start_date, end_date, format = 'csv' } = req.query;

      // 超级管理员可以查看所有租户
      const targetTenantId = isSuperAdmin && req.query.tenant_id
        ? req.query.tenant_id
        : tenantId;

      if (!targetTenantId && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: '无租户上下文',
          error_code: 'NO_TENANT_CONTEXT'
        });
      }

      // 默认查询最近 30 天
      const endDate = end_date || new Date().toISOString().split('T')[0];
      const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      let query = `
        SELECT
          date_created,
          tenant_name,
          employee_name,
          action,
          resource_type,
          resource_id,
          description,
          severity,
          ip_address,
          changed_fields_count,
          response_status
        FROM v_audit_logs_summary
        WHERE date_created >= $1::date
          AND date_created <= ($2::date + INTERVAL '1 day')
      `;

      const params = [startDate, endDate];
      let paramIndex = 3;

      if (targetTenantId) {
        query += ` AND tenant_id = $${paramIndex++}::uuid`;
        params.push(targetTenantId);
      }

      query += ` ORDER BY date_created DESC LIMIT 10000`;

      const result = await database.raw(query, params);
      const rows = result.rows || [];

      if (format === 'csv') {
        const headers = [
          '日期时间', '租户', '操作员', '操作', '资源类型',
          '资源ID', '描述', '严重程度', 'IP地址', '变更字段数', '响应状态'
        ];
        const csvRows = [headers.join(',')];

        for (const row of rows) {
          csvRows.push([
            row.date_created,
            row.tenant_name || '',
            row.employee_name || '',
            row.action || '',
            row.resource_type || '',
            row.resource_id || '',
            (row.description || '').replace(/,/g, ';'),
            row.severity || '',
            row.ip_address || '',
            row.changed_fields_count || 0,
            row.response_status || ''
          ].join(','));
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${startDate}-${endDate}.csv`);
        res.send('\ufeff' + csvRows.join('\n'));
      } else {
        res.json({
          success: true,
          data: rows
        });
      }
    } catch (error) {
      // Error logged('[AuditEndpoint] Error exporting logs:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * DELETE /gym/audit/logs/cleanup
   * 清理旧审计日志（仅超级管理员）
   */
  router.delete('/audit/logs/cleanup', async (req, res) => {
    try {
      const { isSuperAdmin } = req;
      const { retention_days = 365 } = req.query;

      if (!isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: '需要超级管理员权限'
        });
      }

      // 调用清理函数
      const result = await database.raw(`
        SELECT cleanup_old_audit_logs($1) as deleted_count
      `, [parseInt(retention_days)]);

      const deletedCount = result.rows[0].deleted_count;

      res.json({
        success: true,
        message: `成功清理 ${deletedCount} 条旧审计日志`,
        deleted_count: deletedCount
      });
    } catch (error) {
      // Error logged('[AuditEndpoint] Error cleaning up logs:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerAuditRoutes;
