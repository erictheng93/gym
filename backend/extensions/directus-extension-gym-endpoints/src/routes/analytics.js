/**
 * Analytics Routes
 * /gym/analytics/*
 * API 使用統計和監控端點
 */

import Redis from 'ioredis';

// 初始化 Redis 客戶端（用於讀取日誌）
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6333'),
});

redis.on('error', (err) => {
  console.error('[Analytics] Redis error:', err.message);
});

/**
 * 註冊分析路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerAnalyticsRoutes(router, context) {
  const { database } = context;

  /**
   * GET /gym/analytics/api-stats
   * 獲取 API 使用統計
   * Query params:
   *   - timeRange: '24h' | '7d' | '30d' (default: '24h')
   *   - tenant_id: string (super admin only)
   */
  router.get('/analytics/api-stats', async (req, res) => {
    try {
      const { tenantId, isSuperAdmin } = req;
      const timeRange = req.query.timeRange || '24h';

      // 超級管理員可以查詢指定租戶
      const targetTenantId = isSuperAdmin && req.query.tenant_id
        ? req.query.tenant_id
        : tenantId;

      if (!targetTenantId && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: '無租戶上下文',
          error_code: 'NO_TENANT_CONTEXT'
        });
      }

      // 計算時間範圍
      const timeIntervals = {
        '24h': '24 hours',
        '7d': '7 days',
        '30d': '30 days'
      };
      const interval = timeIntervals[timeRange] || '24 hours';

      // 從 api_usage_stats 表獲取真實統計數據
      const statsResult = await database.raw(`
        SELECT
          SUM(total_requests)::INTEGER as total_requests,
          SUM(successful_requests)::INTEGER as successful_requests,
          SUM(failed_requests)::INTEGER as failed_requests,
          AVG(avg_response_time_ms)::INTEGER as avg_response_time,
          SUM(total_request_size_bytes)::BIGINT as total_request_size,
          SUM(total_response_size_bytes)::BIGINT as total_response_size
        FROM api_usage_stats
        WHERE tenant_id = $1::uuid
          AND hour_timestamp >= NOW() - INTERVAL '${interval}'
      `, [targetTenantId]);

      const overallStats = statsResult.rows[0] || {
        total_requests: 0,
        successful_requests: 0,
        failed_requests: 0,
        avg_response_time: 0,
        total_request_size: 0,
        total_response_size: 0
      };

      // 獲取 Top 端點
      const topEndpointsResult = await database.raw(`
        SELECT
          endpoint as path,
          method,
          SUM(total_requests)::INTEGER as count,
          AVG(avg_response_time_ms)::INTEGER as avg_response_time,
          (SUM(failed_requests)::FLOAT / NULLIF(SUM(total_requests), 0) * 100)::DECIMAL(5,2) as error_rate
        FROM api_usage_stats
        WHERE tenant_id = $1::uuid
          AND hour_timestamp >= NOW() - INTERVAL '${interval}'
        GROUP BY endpoint, method
        ORDER BY count DESC
        LIMIT 10
      `, [targetTenantId]);

      // 獲取時間序列數據
      const timeSeriesResult = await database.raw(`
        SELECT
          hour_timestamp,
          SUM(total_requests)::INTEGER as requests,
          SUM(successful_requests)::INTEGER as successful,
          SUM(failed_requests)::INTEGER as failed,
          AVG(avg_response_time_ms)::INTEGER as avg_response_time
        FROM api_usage_stats
        WHERE tenant_id = $1::uuid
          AND hour_timestamp >= NOW() - INTERVAL '${interval}'
        GROUP BY hour_timestamp
        ORDER BY hour_timestamp ASC
      `, [targetTenantId]);

      // 獲取速率限制觸發次數（從 Redis）
      let rateLimitHits = 0;
      try {
        const rlKey = `rl:logs:${targetTenantId}`;
        rateLimitHits = await redis.llen(rlKey);
      } catch (redisError) {
        console.warn('[AnalyticsEndpoint] Failed to get rate limit hits from Redis:', redisError.message);
      }

      const stats = {
        timeRange,
        totalRequests: overallStats.total_requests || 0,
        successfulRequests: overallStats.successful_requests || 0,
        failedRequests: overallStats.failed_requests || 0,
        rateLimitHits,
        avgResponseTime: overallStats.avg_response_time || 0,
        totalRequestSize: overallStats.total_request_size || 0,
        totalResponseSize: overallStats.total_response_size || 0,
        topEndpoints: topEndpointsResult.rows,
        timeSeries: timeSeriesResult.rows
      };

      res.json({
        success: true,
        data: stats
      });

      console.log(`[AnalyticsEndpoint] API stats fetched for range: ${timeRange}, total requests: ${stats.totalRequests}`);
    } catch (error) {
      console.error('[AnalyticsEndpoint] Error fetching API stats:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/analytics/rate-limit-logs
   * 獲取速率限制觸發日誌
   * Query params:
   *   - limit: number (default: 50, max: 100)
   *   - offset: number (default: 0)
   *   - tenant_id: string (super admin only)
   */
  router.get('/analytics/rate-limit-logs', async (req, res) => {
    try {
      const { tenantId, isSuperAdmin } = req;
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset = parseInt(req.query.offset) || 0;

      // 超級管理員可以查詢指定租戶
      const targetTenantId = isSuperAdmin && req.query.tenant_id
        ? req.query.tenant_id
        : tenantId;

      if (!targetTenantId && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: '無租戶上下文',
          error_code: 'NO_TENANT_CONTEXT'
        });
      }

      // 從 Redis 獲取速率限制日誌
      let logs = [];
      try {
        const listKey = `rl:logs:${targetTenantId}`;
        const logKeys = await redis.lrange(listKey, offset, offset + limit - 1);

        // 獲取每個日誌的詳細資訊
        const logPromises = logKeys.map(async (key) => {
          const logData = await redis.get(key);
          return logData ? JSON.parse(logData) : null;
        });

        const allLogs = await Promise.all(logPromises);
        logs = allLogs.filter(log => log !== null);

        // 獲取總日誌數
        const totalLogs = await redis.llen(listKey);

        console.log(`[AnalyticsEndpoint] Retrieved ${logs.length} rate limit logs from Redis`);

        res.json({
          success: true,
          data: {
            logs,
            pagination: {
              limit,
              offset,
              total: totalLogs
            }
          }
        });
      } catch (redisError) {
        console.error('[AnalyticsEndpoint] Redis error, returning mock data:', redisError);

        // Redis 錯誤時返回模擬數據
        logs = Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
          id: `log_${offset + i + 1}`,
          timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
          tenantId: targetTenantId,
          endpoint: `/gym/${['members', 'contracts', 'checkin', 'classes'][Math.floor(Math.random() * 4)]}`,
          planType: 'starter',
          limit: 500
        }));

        res.json({
          success: true,
          data: {
            logs,
            pagination: {
              limit,
              offset,
              total: 5
            }
          },
          note: 'Mock data (Redis unavailable)'
        });
      }

    } catch (error) {
      console.error('[AnalyticsEndpoint] Error fetching rate limit logs:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/analytics/quota-history
   * 獲取配額使用歷史
   * Query params:
   *   - resource: 'members' | 'employees' | 'branches' | 'storage'
   *   - days: number (default: 30, max: 90)
   *   - tenant_id: string (super admin only)
   */
  router.get('/analytics/quota-history', async (req, res) => {
    try {
      const { tenantId, isSuperAdmin } = req;
      const resource = req.query.resource || 'members';
      const days = Math.min(parseInt(req.query.days) || 30, 90);

      // 超級管理員可以查詢指定租戶
      const targetTenantId = isSuperAdmin && req.query.tenant_id
        ? req.query.tenant_id
        : tenantId;

      if (!targetTenantId && !isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: '無租戶上下文',
          error_code: 'NO_TENANT_CONTEXT'
        });
      }

      // 驗證資源類型
      if (!['members', 'employees', 'branches', 'storage'].includes(resource)) {
        return res.status(400).json({
          success: false,
          message: '無效的資源類型',
          error_code: 'INVALID_RESOURCE_TYPE'
        });
      }

      // TODO: 從歷史記錄表獲取配額使用趨勢
      // 目前返回模擬數據
      const history = Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (days - i - 1));
        return {
          date: date.toISOString().split('T')[0],
          count: Math.floor(Math.random() * 100) + 50,
          limit: 500
        };
      });

      res.json({
        success: true,
        data: {
          resource,
          days,
          tenantId: targetTenantId,
          history
        }
      });

      console.log(`[AnalyticsEndpoint] Quota history fetched for ${resource} (${days} days)`);
    } catch (error) {
      console.error('[AnalyticsEndpoint] Error fetching quota history:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerAnalyticsRoutes;
