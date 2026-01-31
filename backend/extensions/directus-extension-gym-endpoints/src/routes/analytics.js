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
  // Error logged('[Analytics] Redis error:', err.message);
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
        // Warning logged('[AnalyticsEndpoint] Failed to get rate limit hits from Redis:', redisError.message);
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

      // Stats logged(`[AnalyticsEndpoint] API stats fetched for range: ${timeRange}, total requests: ${stats.totalRequests}`);
    } catch (error) {
      // Error logged('[AnalyticsEndpoint] Error fetching API stats:', error);
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

        // Stats logged(`[AnalyticsEndpoint] Retrieved ${logs.length} rate limit logs from Redis`);

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
        // Error logged('[AnalyticsEndpoint] Redis error, returning mock data:', redisError);

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
      // Error logged('[AnalyticsEndpoint] Error fetching rate limit logs:', error);
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

      // Stats logged(`[AnalyticsEndpoint] Quota history fetched for ${resource} (${days} days)`);
    } catch (error) {
      // Error logged('[AnalyticsEndpoint] Error fetching quota history:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  // ============================================
  // 業務分析端點 (Business Analytics)
  // ============================================

  /**
   * GET /gym/analytics/member-demographics
   * 會員人口統計分析
   * 包含：會員狀態分佈、年齡分佈、性別分佈
   */
  router.get('/analytics/member-demographics', async (req, res) => {
    try {
      const userId = req.accountability?.user;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: '請先登入',
          error_code: 'UNAUTHORIZED'
        });
      }

      const branchId = req.query.branch_id;

      // 會員狀態分佈
      let statusQuery = `
        SELECT
          status,
          COUNT(*)::INTEGER as count
        FROM members
      `;
      if (branchId) {
        statusQuery += ` WHERE branch_id = $1::uuid`;
      }
      statusQuery += ` GROUP BY status ORDER BY count DESC`;

      const statusResult = await database.raw(
        statusQuery,
        branchId ? [branchId] : []
      );

      // 性別分佈
      let genderQuery = `
        SELECT
          COALESCE(gender, 'UNKNOWN') as gender,
          COUNT(*)::INTEGER as count
        FROM members
      `;
      if (branchId) {
        genderQuery += ` WHERE branch_id = $1::uuid`;
      }
      genderQuery += ` GROUP BY gender ORDER BY count DESC`;

      const genderResult = await database.raw(
        genderQuery,
        branchId ? [branchId] : []
      );

      // 年齡分佈
      let ageQuery = `
        SELECT
          CASE
            WHEN birthday IS NULL THEN '未知'
            WHEN EXTRACT(YEAR FROM AGE(birthday)) < 18 THEN '< 18'
            WHEN EXTRACT(YEAR FROM AGE(birthday)) BETWEEN 18 AND 24 THEN '18-24'
            WHEN EXTRACT(YEAR FROM AGE(birthday)) BETWEEN 25 AND 34 THEN '25-34'
            WHEN EXTRACT(YEAR FROM AGE(birthday)) BETWEEN 35 AND 44 THEN '35-44'
            WHEN EXTRACT(YEAR FROM AGE(birthday)) BETWEEN 45 AND 54 THEN '45-54'
            WHEN EXTRACT(YEAR FROM AGE(birthday)) BETWEEN 55 AND 64 THEN '55-64'
            ELSE '65+'
          END as age_group,
          COUNT(*)::INTEGER as count
        FROM members
      `;
      if (branchId) {
        ageQuery += ` WHERE branch_id = $1::uuid`;
      }
      ageQuery += ` GROUP BY age_group ORDER BY age_group`;

      const ageResult = await database.raw(
        ageQuery,
        branchId ? [branchId] : []
      );

      // 會員來源分佈 (如果有 referral 欄位)
      let joinTrendQuery = `
        SELECT
          DATE_TRUNC('month', join_date)::DATE as month,
          COUNT(*)::INTEGER as count
        FROM members
        WHERE join_date >= CURRENT_DATE - INTERVAL '12 months'
      `;
      if (branchId) {
        joinTrendQuery += ` AND branch_id = $1::uuid`;
      }
      joinTrendQuery += ` GROUP BY month ORDER BY month`;

      const joinTrendResult = await database.raw(
        joinTrendQuery,
        branchId ? [branchId] : []
      );

      res.json({
        success: true,
        data: {
          by_status: statusResult.rows || [],
          by_gender: genderResult.rows || [],
          by_age: ageResult.rows || [],
          join_trend: joinTrendResult.rows || []
        }
      });
    } catch (error) {
      console.error('[Analytics] Member demographics error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });

  /**
   * GET /gym/analytics/contract-analytics
   * 合約分析
   * 包含：合約類型分佈、合約狀態分佈、續約率、合約價值分析
   */
  router.get('/analytics/contract-analytics', async (req, res) => {
    try {
      const userId = req.accountability?.user;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: '請先登入',
          error_code: 'UNAUTHORIZED'
        });
      }

      const branchId = req.query.branch_id;
      const period = req.query.period || '12m'; // 12m, 6m, 3m

      const periodMonths = {
        '12m': 12,
        '6m': 6,
        '3m': 3
      };
      const months = periodMonths[period] || 12;

      // 合約狀態分佈
      let statusQuery = `
        SELECT
          status,
          COUNT(*)::INTEGER as count,
          COALESCE(SUM(total_amount), 0)::NUMERIC as total_value
        FROM contracts
      `;
      if (branchId) {
        statusQuery += ` WHERE branch_id = $1::uuid`;
      }
      statusQuery += ` GROUP BY status ORDER BY count DESC`;

      const statusResult = await database.raw(
        statusQuery,
        branchId ? [branchId] : []
      );

      // 合約類型分佈 (基於方案類型)
      let typeQuery = `
        SELECT
          mp.type as contract_type,
          mp.name as plan_name,
          COUNT(c.id)::INTEGER as count,
          COALESCE(SUM(c.total_amount), 0)::NUMERIC as total_value,
          COALESCE(AVG(c.total_amount), 0)::NUMERIC as avg_value
        FROM contracts c
        JOIN membership_plans mp ON mp.id = c.plan_id
      `;
      if (branchId) {
        typeQuery += ` WHERE c.branch_id = $1::uuid`;
      }
      typeQuery += ` GROUP BY mp.type, mp.name ORDER BY count DESC`;

      const typeResult = await database.raw(
        typeQuery,
        branchId ? [branchId] : []
      );

      // 月度合約趨勢
      let trendQuery = `
        SELECT
          DATE_TRUNC('month', start_date)::DATE as month,
          COUNT(*)::INTEGER as new_contracts,
          COALESCE(SUM(total_amount), 0)::NUMERIC as total_value
        FROM contracts
        WHERE start_date >= CURRENT_DATE - INTERVAL '${months} months'
      `;
      if (branchId) {
        trendQuery += ` AND branch_id = $1::uuid`;
      }
      trendQuery += ` GROUP BY month ORDER BY month`;

      const trendResult = await database.raw(
        trendQuery,
        branchId ? [branchId] : []
      );

      // 續約率計算
      let renewalQuery = `
        WITH expired_in_period AS (
          SELECT DISTINCT member_id
          FROM contracts
          WHERE end_date BETWEEN CURRENT_DATE - INTERVAL '${months} months' AND CURRENT_DATE
        ),
        renewed AS (
          SELECT DISTINCT c.member_id
          FROM contracts c
          JOIN expired_in_period ep ON c.member_id = ep.member_id
          WHERE c.start_date >= CURRENT_DATE - INTERVAL '${months} months'
            AND c.id NOT IN (
              SELECT id FROM contracts
              WHERE end_date BETWEEN CURRENT_DATE - INTERVAL '${months} months' AND CURRENT_DATE
            )
        )
        SELECT
          (SELECT COUNT(*) FROM expired_in_period)::INTEGER as expired_count,
          (SELECT COUNT(*) FROM renewed)::INTEGER as renewed_count
      `;

      const renewalResult = await database.raw(renewalQuery);
      const renewalData = renewalResult.rows?.[0] || {};
      const expiredCount = parseInt(renewalData.expired_count || 0);
      const renewedCount = parseInt(renewalData.renewed_count || 0);
      const renewalRate = expiredCount > 0
        ? ((renewedCount / expiredCount) * 100).toFixed(1)
        : 0;

      // 合約價值統計
      let valueStatsQuery = `
        SELECT
          COALESCE(AVG(total_amount), 0)::NUMERIC as avg_value,
          COALESCE(MIN(total_amount), 0)::NUMERIC as min_value,
          COALESCE(MAX(total_amount), 0)::NUMERIC as max_value,
          COALESCE(SUM(total_amount), 0)::NUMERIC as total_value,
          COUNT(*)::INTEGER as count
        FROM contracts
        WHERE status IN ('ACTIVE', 'EXPIRED')
      `;
      if (branchId) {
        valueStatsQuery += ` AND branch_id = $1::uuid`;
      }

      const valueStatsResult = await database.raw(
        valueStatsQuery,
        branchId ? [branchId] : []
      );

      res.json({
        success: true,
        period,
        data: {
          by_status: statusResult.rows || [],
          by_type: typeResult.rows || [],
          monthly_trend: trendResult.rows || [],
          renewal: {
            expired_count: expiredCount,
            renewed_count: renewedCount,
            rate: parseFloat(renewalRate)
          },
          value_stats: valueStatsResult.rows?.[0] || {}
        }
      });
    } catch (error) {
      console.error('[Analytics] Contract analytics error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });

  /**
   * GET /gym/analytics/checkin-heatmap
   * 打卡熱力圖 (24x7)
   * 返回每天每小時的打卡次數
   */
  router.get('/analytics/checkin-heatmap', async (req, res) => {
    try {
      const userId = req.accountability?.user;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: '請先登入',
          error_code: 'UNAUTHORIZED'
        });
      }

      const branchId = req.query.branch_id;
      const weeks = Math.min(parseInt(req.query.weeks) || 4, 12);

      // 獲取打卡熱力圖數據 (以 attendances 表)
      let heatmapQuery = `
        SELECT
          EXTRACT(DOW FROM check_in)::INTEGER as day_of_week,
          EXTRACT(HOUR FROM check_in)::INTEGER as hour,
          COUNT(*)::INTEGER as count
        FROM attendances
        WHERE check_in >= CURRENT_DATE - INTERVAL '${weeks} weeks'
      `;
      if (branchId) {
        heatmapQuery += ` AND branch_id = $1::uuid`;
      }
      heatmapQuery += ` GROUP BY day_of_week, hour ORDER BY day_of_week, hour`;

      const heatmapResult = await database.raw(
        heatmapQuery,
        branchId ? [branchId] : []
      );

      // 初始化 7x24 矩陣
      const heatmap = Array(7).fill(null).map(() => Array(24).fill(0));

      // 填充數據
      heatmapResult.rows?.forEach(row => {
        const day = parseInt(row.day_of_week);
        const hour = parseInt(row.hour);
        heatmap[day][hour] = parseInt(row.count);
      });

      // 計算尖峰時段
      let peakDay = 0, peakHour = 0, maxCount = 0;
      heatmap.forEach((dayData, day) => {
        dayData.forEach((count, hour) => {
          if (count > maxCount) {
            maxCount = count;
            peakDay = day;
            peakHour = hour;
          }
        });
      });

      // 每日總計
      const dailyTotals = heatmap.map(day => day.reduce((a, b) => a + b, 0));

      // 每小時平均
      const hourlyAverages = Array(24).fill(0);
      for (let h = 0; h < 24; h++) {
        let total = 0;
        for (let d = 0; d < 7; d++) {
          total += heatmap[d][h];
        }
        hourlyAverages[h] = Math.round(total / 7);
      }

      res.json({
        success: true,
        weeks,
        data: {
          heatmap,
          peak: {
            day: peakDay,
            hour: peakHour,
            count: maxCount
          },
          daily_totals: dailyTotals,
          hourly_averages: hourlyAverages,
          day_labels: ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
        }
      });
    } catch (error) {
      console.error('[Analytics] Checkin heatmap error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });

  /**
   * GET /gym/analytics/revenue-breakdown
   * 營收細分分析
   * 包含：分店營收、方案營收、月度趨勢、YoY比較
   */
  router.get('/analytics/revenue-breakdown', async (req, res) => {
    try {
      const userId = req.accountability?.user;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: '請先登入',
          error_code: 'UNAUTHORIZED'
        });
      }

      const branchId = req.query.branch_id;
      const year = parseInt(req.query.year) || new Date().getFullYear();

      // 各分店營收
      let branchRevenueQuery = `
        SELECT
          b.id as branch_id,
          b.name as branch_name,
          COALESCE(SUM(p.amount), 0)::NUMERIC as total_revenue,
          COUNT(p.id)::INTEGER as transaction_count,
          COALESCE(AVG(p.amount), 0)::NUMERIC as avg_transaction
        FROM branches b
        LEFT JOIN payments p ON p.branch_id = b.id
          AND p.type = 'INCOME'
          AND EXTRACT(YEAR FROM p.payment_date) = $1
        GROUP BY b.id, b.name
        ORDER BY total_revenue DESC
      `;

      const branchRevenueResult = await database.raw(branchRevenueQuery, [year]);

      // 各方案營收
      let planRevenueQuery = `
        SELECT
          mp.id as plan_id,
          mp.name as plan_name,
          mp.type as plan_type,
          COALESCE(SUM(p.amount), 0)::NUMERIC as total_revenue,
          COUNT(p.id)::INTEGER as transaction_count
        FROM membership_plans mp
        LEFT JOIN contracts c ON c.plan_id = mp.id
        LEFT JOIN payments p ON p.contract_id = c.id
          AND p.type = 'INCOME'
          AND EXTRACT(YEAR FROM p.payment_date) = $1
        GROUP BY mp.id, mp.name, mp.type
        ORDER BY total_revenue DESC
      `;

      const planRevenueResult = await database.raw(planRevenueQuery, [year]);

      // 月度營收趨勢
      let monthlyQuery = `
        SELECT
          EXTRACT(MONTH FROM payment_date)::INTEGER as month,
          COALESCE(SUM(amount), 0)::NUMERIC as revenue,
          COUNT(*)::INTEGER as transactions
        FROM payments
        WHERE type = 'INCOME'
          AND EXTRACT(YEAR FROM payment_date) = $1
      `;
      if (branchId) {
        monthlyQuery += ` AND branch_id = $2::uuid`;
      }
      monthlyQuery += ` GROUP BY month ORDER BY month`;

      const monthlyResult = await database.raw(
        monthlyQuery,
        branchId ? [year, branchId] : [year]
      );

      // 填充完整12個月
      const monthlyData = Array(12).fill(null).map((_, i) => ({
        month: i + 1,
        revenue: 0,
        transactions: 0
      }));
      monthlyResult.rows?.forEach(row => {
        const idx = parseInt(row.month) - 1;
        monthlyData[idx] = {
          month: parseInt(row.month),
          revenue: parseFloat(row.revenue),
          transactions: parseInt(row.transactions)
        };
      });

      // YoY 比較
      const lastYear = year - 1;
      let yoyQuery = `
        SELECT
          EXTRACT(YEAR FROM payment_date)::INTEGER as year,
          COALESCE(SUM(amount), 0)::NUMERIC as total_revenue,
          COUNT(*)::INTEGER as transaction_count
        FROM payments
        WHERE type = 'INCOME'
          AND EXTRACT(YEAR FROM payment_date) IN ($1, $2)
      `;
      if (branchId) {
        yoyQuery += ` AND branch_id = $3::uuid`;
      }
      yoyQuery += ` GROUP BY year ORDER BY year`;

      const yoyResult = await database.raw(
        yoyQuery,
        branchId ? [year, lastYear, branchId] : [year, lastYear]
      );

      const yoyData = {};
      yoyResult.rows?.forEach(row => {
        yoyData[row.year] = {
          revenue: parseFloat(row.total_revenue),
          transactions: parseInt(row.transaction_count)
        };
      });

      const currentYearRevenue = yoyData[year]?.revenue || 0;
      const lastYearRevenue = yoyData[lastYear]?.revenue || 0;
      const yoyChange = lastYearRevenue > 0
        ? ((currentYearRevenue - lastYearRevenue) / lastYearRevenue * 100).toFixed(1)
        : 0;

      // 付款方式分佈
      let paymentMethodQuery = `
        SELECT
          payment_method,
          COALESCE(SUM(amount), 0)::NUMERIC as total,
          COUNT(*)::INTEGER as count
        FROM payments
        WHERE type = 'INCOME'
          AND EXTRACT(YEAR FROM payment_date) = $1
      `;
      if (branchId) {
        paymentMethodQuery += ` AND branch_id = $2::uuid`;
      }
      paymentMethodQuery += ` GROUP BY payment_method ORDER BY total DESC`;

      const paymentMethodResult = await database.raw(
        paymentMethodQuery,
        branchId ? [year, branchId] : [year]
      );

      res.json({
        success: true,
        year,
        data: {
          by_branch: branchRevenueResult.rows || [],
          by_plan: planRevenueResult.rows || [],
          by_payment_method: paymentMethodResult.rows || [],
          monthly: monthlyData,
          yoy: {
            current_year: currentYearRevenue,
            last_year: lastYearRevenue,
            change_percent: parseFloat(yoyChange)
          }
        }
      });
    } catch (error) {
      console.error('[Analytics] Revenue breakdown error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });
}

export default registerAnalyticsRoutes;
