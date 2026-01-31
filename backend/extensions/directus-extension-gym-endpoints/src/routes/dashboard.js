/**
 * Dashboard Routes
 * /gym/dashboard/*
 * HQ 戰情室 API 端點
 */

import {
  getCachedReport,
  setCachedReport,
} from '../utils/redis.js';

const DASHBOARD_CACHE_TTL = 300; // 5 minutes

/**
 * 註冊儀表板路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerDashboardRoutes(router, context) {
  const { database } = context;

  /**
   * GET /gym/dashboard/kpis
   * 獲取戰情室 KPI 數據
   * Query params:
   *   - period: 'today' | 'week' | 'month' | 'year' (default: 'today')
   *   - branch_id: string (optional, filter by branch)
   */
  router.get('/dashboard/kpis', async (req, res) => {
    try {
      const userId = req.accountability?.user;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: '請先登入',
          error_code: 'UNAUTHORIZED'
        });
      }

      const { tenantId, isSuperAdmin } = req;
      const period = req.query.period || 'today';
      const branchId = req.query.branch_id;

      // 計算日期範圍
      const now = new Date();
      let startDate, endDate;

      switch (period) {
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case 'today':
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }
      endDate = now;

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // 嘗試從快取讀取
      const cacheKey = `kpis_${period}_${branchId || 'all'}_${tenantId || 'global'}`;
      const cached = await getCachedReport('dashboard', cacheKey);
      if (cached) {
        return res.json(cached);
      }

      // ============================================
      // 1. 營收 KPIs
      // ============================================
      let revenueQuery = `
        SELECT
          COALESCE(SUM(CASE WHEN DATE(payment_date) = CURRENT_DATE THEN amount ELSE 0 END), 0)::NUMERIC as today_revenue,
          COALESCE(SUM(CASE WHEN payment_date >= $1::date THEN amount ELSE 0 END), 0)::NUMERIC as period_revenue,
          COALESCE(SUM(CASE WHEN payment_date >= DATE_TRUNC('month', CURRENT_DATE) THEN amount ELSE 0 END), 0)::NUMERIC as mtd_revenue,
          COALESCE(SUM(CASE WHEN payment_date >= DATE_TRUNC('year', CURRENT_DATE) THEN amount ELSE 0 END), 0)::NUMERIC as ytd_revenue,
          COUNT(CASE WHEN DATE(payment_date) = CURRENT_DATE THEN 1 END)::INTEGER as today_transactions,
          COUNT(CASE WHEN payment_date >= $1::date THEN 1 END)::INTEGER as period_transactions
        FROM payments
        WHERE type = 'INCOME'
      `;
      const revenueParams = [startDateStr];

      if (branchId) {
        revenueQuery += ` AND branch_id = $2::uuid`;
        revenueParams.push(branchId);
      }

      const revenueResult = await database.raw(revenueQuery, revenueParams);
      const revenueData = revenueResult.rows?.[0] || {};

      // 上期同比
      const previousPeriodStart = new Date(startDate);
      const previousPeriodEnd = new Date(endDate);
      const periodDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      previousPeriodStart.setDate(previousPeriodStart.getDate() - periodDays);
      previousPeriodEnd.setDate(previousPeriodEnd.getDate() - periodDays);

      let previousRevenueQuery = `
        SELECT COALESCE(SUM(amount), 0)::NUMERIC as previous_revenue
        FROM payments
        WHERE type = 'INCOME'
          AND payment_date >= $1::date
          AND payment_date < $2::date
      `;
      const previousParams = [
        previousPeriodStart.toISOString().split('T')[0],
        startDateStr
      ];

      if (branchId) {
        previousRevenueQuery += ` AND branch_id = $3::uuid`;
        previousParams.push(branchId);
      }

      const previousRevenueResult = await database.raw(previousRevenueQuery, previousParams);
      const previousRevenue = parseFloat(previousRevenueResult.rows?.[0]?.previous_revenue || 0);
      const currentRevenue = parseFloat(revenueData.period_revenue || 0);
      const revenueChange = previousRevenue > 0
        ? ((currentRevenue - previousRevenue) / previousRevenue * 100).toFixed(1)
        : 0;

      // 營收分佈 (依付款方式)
      let paymentMethodQuery = `
        SELECT
          payment_method,
          COALESCE(SUM(amount), 0)::NUMERIC as amount,
          COUNT(*)::INTEGER as count
        FROM payments
        WHERE type = 'INCOME'
          AND payment_date >= $1::date
      `;
      if (branchId) {
        paymentMethodQuery += ` AND branch_id = $2::uuid`;
      }
      paymentMethodQuery += ` GROUP BY payment_method`;

      const paymentMethodResult = await database.raw(
        paymentMethodQuery,
        branchId ? [startDateStr, branchId] : [startDateStr]
      );

      // 各分店營收
      let branchRevenueQuery = `
        SELECT
          b.id as branch_id,
          b.name as branch_name,
          COALESCE(SUM(p.amount), 0)::NUMERIC as revenue,
          COUNT(p.id)::INTEGER as transactions
        FROM branches b
        LEFT JOIN payments p ON p.branch_id = b.id
          AND p.type = 'INCOME'
          AND p.payment_date >= $1::date
        GROUP BY b.id, b.name
        ORDER BY revenue DESC
      `;

      const branchRevenueResult = await database.raw(branchRevenueQuery, [startDateStr]);

      // ============================================
      // 2. 會員 KPIs
      // ============================================
      let memberQuery = `
        SELECT
          COUNT(*)::INTEGER as total_members,
          COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::INTEGER as active_members,
          COUNT(CASE WHEN join_date >= $1::date THEN 1 END)::INTEGER as new_members,
          COUNT(CASE WHEN status = 'EXPIRED' AND updated_at >= $1::date THEN 1 END)::INTEGER as churned_members,
          COUNT(CASE WHEN gender = 'MALE' THEN 1 END)::INTEGER as male_count,
          COUNT(CASE WHEN gender = 'FEMALE' THEN 1 END)::INTEGER as female_count
        FROM members
      `;
      if (branchId) {
        memberQuery += ` WHERE branch_id = $2::uuid`;
      }

      const memberResult = await database.raw(
        memberQuery,
        branchId ? [startDateStr, branchId] : [startDateStr]
      );
      const memberData = memberResult.rows?.[0] || {};

      const totalMembers = parseInt(memberData.total_members || 0);
      const activeMembers = parseInt(memberData.active_members || 0);
      const activeRate = totalMembers > 0
        ? ((activeMembers / totalMembers) * 100).toFixed(1)
        : 0;

      // 各分店會員分佈
      let branchMemberQuery = `
        SELECT
          b.id as branch_id,
          b.name as branch_name,
          COUNT(m.id)::INTEGER as total,
          COUNT(CASE WHEN m.status = 'ACTIVE' THEN 1 END)::INTEGER as active
        FROM branches b
        LEFT JOIN members m ON m.branch_id = b.id
        GROUP BY b.id, b.name
        ORDER BY total DESC
      `;

      const branchMemberResult = await database.raw(branchMemberQuery);

      // 年齡分佈
      let ageDistributionQuery = `
        SELECT
          CASE
            WHEN EXTRACT(YEAR FROM AGE(birthday)) < 20 THEN '< 20'
            WHEN EXTRACT(YEAR FROM AGE(birthday)) BETWEEN 20 AND 29 THEN '20-29'
            WHEN EXTRACT(YEAR FROM AGE(birthday)) BETWEEN 30 AND 39 THEN '30-39'
            WHEN EXTRACT(YEAR FROM AGE(birthday)) BETWEEN 40 AND 49 THEN '40-49'
            WHEN EXTRACT(YEAR FROM AGE(birthday)) BETWEEN 50 AND 59 THEN '50-59'
            ELSE '60+'
          END as age_group,
          COUNT(*)::INTEGER as count
        FROM members
        WHERE birthday IS NOT NULL
      `;
      if (branchId) {
        ageDistributionQuery += ` AND branch_id = $1::uuid`;
      }
      ageDistributionQuery += ` GROUP BY age_group ORDER BY age_group`;

      const ageDistributionResult = await database.raw(
        ageDistributionQuery,
        branchId ? [branchId] : []
      );

      // ============================================
      // 3. 合約 KPIs
      // ============================================
      let contractQuery = `
        SELECT
          COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END)::INTEGER as active_contracts,
          COUNT(CASE WHEN status = 'ACTIVE' AND end_date <= CURRENT_DATE + INTERVAL '7 days' THEN 1 END)::INTEGER as expiring_7,
          COUNT(CASE WHEN status = 'ACTIVE' AND end_date <= CURRENT_DATE + INTERVAL '30 days' THEN 1 END)::INTEGER as expiring_30,
          COUNT(CASE WHEN status = 'ACTIVE' AND end_date <= CURRENT_DATE + INTERVAL '90 days' THEN 1 END)::INTEGER as expiring_90,
          COALESCE(AVG(total_amount), 0)::NUMERIC as avg_contract_value
        FROM contracts
      `;
      if (branchId) {
        contractQuery += ` WHERE branch_id = $1::uuid`;
      }

      const contractResult = await database.raw(
        contractQuery,
        branchId ? [branchId] : []
      );
      const contractData = contractResult.rows?.[0] || {};

      // 合約類型分佈
      let contractTypeQuery = `
        SELECT
          mp.type as contract_type,
          mp.name as plan_name,
          COUNT(c.id)::INTEGER as count,
          COALESCE(SUM(c.total_amount), 0)::NUMERIC as total_value
        FROM contracts c
        JOIN membership_plans mp ON mp.id = c.plan_id
        WHERE c.status = 'ACTIVE'
      `;
      if (branchId) {
        contractTypeQuery += ` AND c.branch_id = $1::uuid`;
      }
      contractTypeQuery += ` GROUP BY mp.type, mp.name ORDER BY count DESC`;

      const contractTypeResult = await database.raw(
        contractTypeQuery,
        branchId ? [branchId] : []
      );

      // 續約率計算 (過去90天到期且續約的比例)
      let renewalQuery = `
        WITH expired_contracts AS (
          SELECT DISTINCT member_id
          FROM contracts
          WHERE end_date BETWEEN CURRENT_DATE - INTERVAL '90 days' AND CURRENT_DATE
            AND status IN ('EXPIRED', 'ACTIVE')
        ),
        renewed AS (
          SELECT DISTINCT c.member_id
          FROM contracts c
          JOIN expired_contracts ec ON c.member_id = ec.member_id
          WHERE c.start_date >= CURRENT_DATE - INTERVAL '90 days'
            AND c.id != (
              SELECT id FROM contracts
              WHERE member_id = ec.member_id
                AND end_date BETWEEN CURRENT_DATE - INTERVAL '90 days' AND CURRENT_DATE
              LIMIT 1
            )
        )
        SELECT
          (SELECT COUNT(*) FROM expired_contracts)::INTEGER as expired_count,
          (SELECT COUNT(*) FROM renewed)::INTEGER as renewed_count
      `;

      const renewalResult = await database.raw(renewalQuery);
      const renewalData = renewalResult.rows?.[0] || {};
      const expiredCount = parseInt(renewalData.expired_count || 0);
      const renewedCount = parseInt(renewalData.renewed_count || 0);
      const renewalRate = expiredCount > 0
        ? ((renewedCount / expiredCount) * 100).toFixed(1)
        : 0;

      // ============================================
      // 4. 運營 KPIs (打卡數據)
      // ============================================
      // 使用 attendances 表作為打卡記錄 (員工打卡) 和 class_bookings 表 (會員課程出席)
      let checkinQuery = `
        SELECT
          COUNT(CASE WHEN DATE(check_in) = CURRENT_DATE THEN 1 END)::INTEGER as today_checkins,
          COUNT(CASE WHEN check_in >= $1::date THEN 1 END)::INTEGER as period_checkins,
          EXTRACT(HOUR FROM check_in) as hour
        FROM attendances
        WHERE check_in >= $1::date
      `;
      if (branchId) {
        checkinQuery = `
          SELECT
            COUNT(CASE WHEN DATE(check_in) = CURRENT_DATE THEN 1 END)::INTEGER as today_checkins,
            COUNT(CASE WHEN check_in >= $1::date THEN 1 END)::INTEGER as period_checkins,
            EXTRACT(HOUR FROM check_in) as hour
          FROM attendances
          WHERE check_in >= $1::date AND branch_id = $2::uuid
        `;
      }

      // 基礎打卡統計
      let basicCheckinQuery = `
        SELECT
          COUNT(CASE WHEN DATE(check_in) = CURRENT_DATE THEN 1 END)::INTEGER as today_checkins,
          COUNT(CASE WHEN check_in >= $1::date THEN 1 END)::INTEGER as period_checkins
        FROM attendances
        WHERE check_in >= $1::date
      `;
      if (branchId) {
        basicCheckinQuery += ` AND branch_id = $2::uuid`;
      }

      const basicCheckinResult = await database.raw(
        basicCheckinQuery,
        branchId ? [startDateStr, branchId] : [startDateStr]
      );
      const checkinData = basicCheckinResult.rows?.[0] || {};

      // 每小時分佈
      let hourlyQuery = `
        SELECT
          EXTRACT(HOUR FROM check_in)::INTEGER as hour,
          COUNT(*)::INTEGER as count
        FROM attendances
        WHERE DATE(check_in) = CURRENT_DATE
      `;
      if (branchId) {
        hourlyQuery += ` AND branch_id = $1::uuid`;
      }
      hourlyQuery += ` GROUP BY hour ORDER BY hour`;

      const hourlyResult = await database.raw(
        hourlyQuery,
        branchId ? [branchId] : []
      );

      // 填充24小時數據
      const hourlyDistribution = Array(24).fill(0);
      hourlyResult.rows?.forEach(row => {
        hourlyDistribution[parseInt(row.hour)] = parseInt(row.count);
      });

      // 尖峰時段
      let peakHour = 0;
      let maxCount = 0;
      hourlyDistribution.forEach((count, hour) => {
        if (count > maxCount) {
          maxCount = count;
          peakHour = hour;
        }
      });

      // 各分店使用率
      let branchCheckinQuery = `
        SELECT
          b.id as branch_id,
          b.name as branch_name,
          COUNT(CASE WHEN DATE(a.check_in) = CURRENT_DATE THEN 1 END)::INTEGER as today_checkins,
          COUNT(a.id)::INTEGER as period_checkins
        FROM branches b
        LEFT JOIN attendances a ON a.branch_id = b.id
          AND a.check_in >= $1::date
        GROUP BY b.id, b.name
        ORDER BY today_checkins DESC
      `;

      const branchCheckinResult = await database.raw(branchCheckinQuery, [startDateStr]);

      // 課程出席率
      let classAttendanceQuery = `
        SELECT
          COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::INTEGER as completed,
          COUNT(CASE WHEN status = 'NO_SHOW' THEN 1 END)::INTEGER as no_show,
          COUNT(*)::INTEGER as total
        FROM class_bookings
        WHERE scheduled_at >= $1::date
          AND scheduled_at <= CURRENT_TIMESTAMP
          AND status IN ('COMPLETED', 'NO_SHOW')
      `;
      if (branchId) {
        classAttendanceQuery += ` AND branch_id = $2::uuid`;
      }

      const classAttendanceResult = await database.raw(
        classAttendanceQuery,
        branchId ? [startDateStr, branchId] : [startDateStr]
      );
      const classData = classAttendanceResult.rows?.[0] || {};
      const classTotal = parseInt(classData.total || 0);
      const classCompleted = parseInt(classData.completed || 0);
      const classAttendanceRate = classTotal > 0
        ? ((classCompleted / classTotal) * 100).toFixed(1)
        : 0;

      // ============================================
      // 組裝響應
      // ============================================
      const response = {
        success: true,
        period: {
          type: period,
          start_date: startDateStr,
          end_date: endDateStr
        },
        revenue: {
          today: parseFloat(revenueData.today_revenue || 0),
          mtd: parseFloat(revenueData.mtd_revenue || 0),
          ytd: parseFloat(revenueData.ytd_revenue || 0),
          period: currentRevenue,
          change: parseFloat(revenueChange),
          transactions: {
            today: parseInt(revenueData.today_transactions || 0),
            period: parseInt(revenueData.period_transactions || 0)
          },
          by_payment_method: paymentMethodResult.rows || [],
          by_branch: branchRevenueResult.rows || []
        },
        members: {
          total: totalMembers,
          active: activeMembers,
          new: parseInt(memberData.new_members || 0),
          churned: parseInt(memberData.churned_members || 0),
          active_rate: parseFloat(activeRate),
          by_gender: {
            male: parseInt(memberData.male_count || 0),
            female: parseInt(memberData.female_count || 0)
          },
          by_age: ageDistributionResult.rows || [],
          by_branch: branchMemberResult.rows || []
        },
        contracts: {
          active: parseInt(contractData.active_contracts || 0),
          expiring_7: parseInt(contractData.expiring_7 || 0),
          expiring_30: parseInt(contractData.expiring_30 || 0),
          expiring_90: parseInt(contractData.expiring_90 || 0),
          renewal_rate: parseFloat(renewalRate),
          avg_value: parseFloat(contractData.avg_contract_value || 0),
          by_type: contractTypeResult.rows || []
        },
        operations: {
          today_checkins: parseInt(checkinData.today_checkins || 0),
          period_checkins: parseInt(checkinData.period_checkins || 0),
          peak_hour: peakHour,
          hourly_distribution: hourlyDistribution,
          class_attendance_rate: parseFloat(classAttendanceRate),
          by_branch: branchCheckinResult.rows || []
        },
        generated_at: new Date().toISOString()
      };

      // 快取結果
      await setCachedReport('dashboard', cacheKey, response, DASHBOARD_CACHE_TTL);

      res.json(response);
    } catch (error) {
      console.error('[Dashboard] KPIs error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
        error_code: 'DASHBOARD_ERROR'
      });
    }
  });

  /**
   * GET /gym/dashboard/live
   * Server-Sent Events 即時更新串流
   * 提供即時打卡、即時營收等數據
   */
  router.get('/dashboard/live', async (req, res) => {
    try {
      const userId = req.accountability?.user;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: '請先登入',
          error_code: 'UNAUTHORIZED'
        });
      }

      const { tenantId } = req;
      const branchId = req.query.branch_id;

      // 設定 SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // 發送初始連線確認
      res.write(`event: connected\n`);
      res.write(`data: ${JSON.stringify({ status: 'connected', timestamp: new Date().toISOString() })}\n\n`);

      // 定期推送數據 (每30秒)
      const interval = setInterval(async () => {
        try {
          // 獲取即時打卡數
          let checkinQuery = `
            SELECT COUNT(*)::INTEGER as count
            FROM attendances
            WHERE DATE(check_in) = CURRENT_DATE
          `;
          if (branchId) {
            checkinQuery += ` AND branch_id = $1::uuid`;
          }

          const checkinResult = await database.raw(
            checkinQuery,
            branchId ? [branchId] : []
          );

          // 獲取今日營收
          let revenueQuery = `
            SELECT COALESCE(SUM(amount), 0)::NUMERIC as today_revenue
            FROM payments
            WHERE type = 'INCOME'
              AND DATE(payment_date) = CURRENT_DATE
          `;
          if (branchId) {
            revenueQuery += ` AND branch_id = $1::uuid`;
          }

          const revenueResult = await database.raw(
            revenueQuery,
            branchId ? [branchId] : []
          );

          // 獲取最近的打卡記錄 (最近5筆)
          let recentCheckinQuery = `
            SELECT
              a.id,
              e.full_name as employee_name,
              a.check_in,
              b.name as branch_name
            FROM attendances a
            JOIN employees e ON e.id = a.employee_id
            JOIN branches b ON b.id = a.branch_id
            WHERE DATE(a.check_in) = CURRENT_DATE
            ORDER BY a.check_in DESC
            LIMIT 5
          `;

          const recentResult = await database.raw(recentCheckinQuery);

          const liveData = {
            timestamp: new Date().toISOString(),
            today_checkins: parseInt(checkinResult.rows?.[0]?.count || 0),
            today_revenue: parseFloat(revenueResult.rows?.[0]?.today_revenue || 0),
            recent_checkins: recentResult.rows?.map(row => ({
              id: row.id,
              name: row.employee_name,
              time: row.check_in,
              branch: row.branch_name
            })) || []
          };

          res.write(`event: update\n`);
          res.write(`data: ${JSON.stringify(liveData)}\n\n`);
        } catch (err) {
          console.error('[Dashboard] Live update error:', err);
          res.write(`event: error\n`);
          res.write(`data: ${JSON.stringify({ error: 'Update failed' })}\n\n`);
        }
      }, 30000); // 每30秒更新

      // 立即發送一次數據
      setTimeout(async () => {
        try {
          let checkinQuery = `
            SELECT COUNT(*)::INTEGER as count
            FROM attendances
            WHERE DATE(check_in) = CURRENT_DATE
          `;
          if (branchId) {
            checkinQuery += ` AND branch_id = $1::uuid`;
          }

          const checkinResult = await database.raw(
            checkinQuery,
            branchId ? [branchId] : []
          );

          let revenueQuery = `
            SELECT COALESCE(SUM(amount), 0)::NUMERIC as today_revenue
            FROM payments
            WHERE type = 'INCOME'
              AND DATE(payment_date) = CURRENT_DATE
          `;
          if (branchId) {
            revenueQuery += ` AND branch_id = $1::uuid`;
          }

          const revenueResult = await database.raw(
            revenueQuery,
            branchId ? [branchId] : []
          );

          const liveData = {
            timestamp: new Date().toISOString(),
            today_checkins: parseInt(checkinResult.rows?.[0]?.count || 0),
            today_revenue: parseFloat(revenueResult.rows?.[0]?.today_revenue || 0),
            recent_checkins: []
          };

          res.write(`event: update\n`);
          res.write(`data: ${JSON.stringify(liveData)}\n\n`);
        } catch (err) {
          console.error('[Dashboard] Initial update error:', err);
        }
      }, 100);

      // 清理連線
      req.on('close', () => {
        clearInterval(interval);
      });

      req.on('error', () => {
        clearInterval(interval);
      });

    } catch (error) {
      console.error('[Dashboard] SSE error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
        error_code: 'SSE_ERROR'
      });
    }
  });

  /**
   * GET /gym/dashboard/revenue-targets
   * 獲取營收目標
   */
  router.get('/dashboard/revenue-targets', async (req, res) => {
    try {
      const userId = req.accountability?.user;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: '請先登入',
          error_code: 'UNAUTHORIZED'
        });
      }

      const year = parseInt(req.query.year) || new Date().getFullYear();
      const branchId = req.query.branch_id;

      let query = `
        SELECT
          rt.id,
          rt.branch_id,
          b.name as branch_name,
          rt.year,
          rt.month,
          rt.target_amount
        FROM revenue_targets rt
        JOIN branches b ON b.id = rt.branch_id
        WHERE rt.year = $1
      `;
      const params = [year];

      if (branchId) {
        query += ` AND rt.branch_id = $2::uuid`;
        params.push(branchId);
      }

      query += ` ORDER BY rt.branch_id, rt.month`;

      const result = await database.raw(query, params);

      res.json({
        success: true,
        year,
        targets: result.rows || []
      });
    } catch (error) {
      console.error('[Dashboard] Revenue targets error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });

  /**
   * POST /gym/dashboard/revenue-targets
   * 設定營收目標 (管理員)
   */
  router.post('/dashboard/revenue-targets', async (req, res) => {
    try {
      const userId = req.accountability?.user;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: '請先登入',
          error_code: 'UNAUTHORIZED'
        });
      }

      const isAdmin = req.accountability?.admin === true;
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: '權限不足',
          error_code: 'FORBIDDEN'
        });
      }

      const { branch_id, year, month, target_amount } = req.body;

      if (!branch_id || !year || !month || target_amount === undefined) {
        return res.status(400).json({
          success: false,
          message: '缺少必要參數',
          error_code: 'INVALID_PAYLOAD'
        });
      }

      // Upsert target
      const result = await database.raw(`
        INSERT INTO revenue_targets (id, branch_id, year, month, target_amount)
        VALUES (gen_uuid_v7(), $1::uuid, $2, $3, $4)
        ON CONFLICT (branch_id, year, month)
        DO UPDATE SET target_amount = $4
        RETURNING *
      `, [branch_id, year, month, target_amount]);

      res.json({
        success: true,
        target: result.rows?.[0]
      });
    } catch (error) {
      console.error('[Dashboard] Set revenue target error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });

  /**
   * GET /gym/dashboard/contract-alerts
   * 獲取合約到期警示
   */
  router.get('/dashboard/contract-alerts', async (req, res) => {
    try {
      const userId = req.accountability?.user;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: '請先登入',
          error_code: 'UNAUTHORIZED'
        });
      }

      const daysAhead = parseInt(req.query.days_ahead) || 30;
      const branchId = req.query.branch_id;
      const limit = Math.min(parseInt(req.query.limit) || 50, 200);

      let query = `
        SELECT
          c.id as contract_id,
          c.contract_no,
          c.end_date,
          c.status,
          c.total_amount,
          c.paid_amount,
          (c.end_date - CURRENT_DATE)::INTEGER as days_until_expiry,
          m.id as member_id,
          m.full_name as member_name,
          m.phone as member_phone,
          m.email as member_email,
          b.name as branch_name,
          mp.name as plan_name,
          e.full_name as sales_person_name
        FROM contracts c
        JOIN members m ON m.id = c.member_id
        JOIN branches b ON b.id = c.branch_id
        JOIN membership_plans mp ON mp.id = c.plan_id
        LEFT JOIN employees e ON e.id = c.sales_person_id
        WHERE c.status = 'ACTIVE'
          AND c.end_date <= CURRENT_DATE + $1 * INTERVAL '1 day'
      `;
      const params = [daysAhead];

      if (branchId) {
        query += ` AND c.branch_id = $2::uuid`;
        params.push(branchId);
      }

      query += ` ORDER BY c.end_date ASC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await database.raw(query, params);

      // 分組
      const alerts = result.rows || [];
      const grouped = {
        urgent: alerts.filter(a => a.days_until_expiry <= 7),
        soon: alerts.filter(a => a.days_until_expiry > 7 && a.days_until_expiry <= 30),
        upcoming: alerts.filter(a => a.days_until_expiry > 30)
      };

      res.json({
        success: true,
        summary: {
          total: alerts.length,
          urgent: grouped.urgent.length,
          soon: grouped.soon.length,
          upcoming: grouped.upcoming.length
        },
        grouped,
        alerts
      });
    } catch (error) {
      console.error('[Dashboard] Contract alerts error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error'
      });
    }
  });

  /**
   * GET /gym/dashboard/export
   * 匯出報表 (CSV/Excel)
   * Query params:
   *   - type: 'kpis' | 'member-analytics' | 'revenue' | 'contracts'
   *   - format: 'csv' | 'json' (default: 'csv')
   *   - days: number (default: 30)
   *   - branch_id: string (optional)
   */
  router.get('/dashboard/export', async (req, res) => {
    try {
      const userId = req.accountability?.user;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: '請先登入',
          error_code: 'UNAUTHORIZED'
        });
      }

      const { tenantId } = req;
      const exportType = req.query.type || 'kpis';
      const format = req.query.format || 'csv';
      const days = parseInt(req.query.days) || 30;
      const branchId = req.query.branch_id;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];

      let data = [];
      let filename = '';

      switch (exportType) {
        case 'kpis':
        case 'member-analytics': {
          // 會員分析數據匯出
          let memberQuery = `
            SELECT
              m.id,
              m.full_name,
              m.email,
              m.phone,
              m.gender,
              m.birthday,
              m.status,
              m.join_date,
              b.name as branch_name,
              (
                SELECT COUNT(*) FROM contracts c
                WHERE c.member_id = m.id AND c.status = 'ACTIVE'
              ) as active_contracts,
              (
                SELECT COUNT(*) FROM attendances a
                WHERE a.member_id = m.id AND a.check_in >= $1::date
              ) as checkin_count
            FROM members m
            JOIN branches b ON b.id = m.branch_id
            WHERE m.date_created >= $1::date
          `;
          const params = [startDateStr];

          if (branchId) {
            memberQuery += ` AND m.branch_id = $2::uuid`;
            params.push(branchId);
          }

          memberQuery += ` ORDER BY m.join_date DESC LIMIT 5000`;

          const result = await database.raw(memberQuery, params);
          data = result.rows || [];
          filename = `member-analytics-${new Date().toISOString().split('T')[0]}`;
          break;
        }

        case 'revenue': {
          // 營收數據匯出
          let revenueQuery = `
            SELECT
              p.id,
              p.payment_date,
              p.amount,
              p.type,
              p.payment_method,
              p.status,
              p.description,
              m.full_name as member_name,
              c.contract_no,
              b.name as branch_name,
              e.full_name as received_by
            FROM payments p
            LEFT JOIN members m ON m.id = p.member_id
            LEFT JOIN contracts c ON c.id = p.contract_id
            JOIN branches b ON b.id = p.branch_id
            LEFT JOIN employees e ON e.id = p.received_by_id
            WHERE p.payment_date >= $1::date
              AND p.type = 'INCOME'
          `;
          const params = [startDateStr];

          if (branchId) {
            revenueQuery += ` AND p.branch_id = $2::uuid`;
            params.push(branchId);
          }

          revenueQuery += ` ORDER BY p.payment_date DESC LIMIT 10000`;

          const result = await database.raw(revenueQuery, params);
          data = result.rows || [];
          filename = `revenue-${new Date().toISOString().split('T')[0]}`;
          break;
        }

        case 'contracts': {
          // 合約數據匯出
          let contractQuery = `
            SELECT
              c.id,
              c.contract_no,
              c.status,
              c.start_date,
              c.end_date,
              c.total_amount,
              c.paid_amount,
              c.remaining_count,
              mp.name as plan_name,
              mp.type as plan_type,
              m.full_name as member_name,
              m.phone as member_phone,
              b.name as branch_name,
              e.full_name as sales_person,
              (c.end_date - CURRENT_DATE)::INTEGER as days_remaining
            FROM contracts c
            JOIN members m ON m.id = c.member_id
            JOIN membership_plans mp ON mp.id = c.plan_id
            JOIN branches b ON b.id = c.branch_id
            LEFT JOIN employees e ON e.id = c.sales_person_id
            WHERE c.date_created >= $1::date
          `;
          const params = [startDateStr];

          if (branchId) {
            contractQuery += ` AND c.branch_id = $2::uuid`;
            params.push(branchId);
          }

          contractQuery += ` ORDER BY c.end_date ASC LIMIT 5000`;

          const result = await database.raw(contractQuery, params);
          data = result.rows || [];
          filename = `contracts-${new Date().toISOString().split('T')[0]}`;
          break;
        }

        case 'checkins': {
          // 打卡數據匯出
          let checkinQuery = `
            SELECT
              a.id,
              a.check_in,
              a.check_out,
              CASE WHEN a.employee_id IS NOT NULL THEN 'EMPLOYEE' ELSE 'MEMBER' END as type,
              COALESCE(e.full_name, m.full_name) as person_name,
              b.name as branch_name,
              EXTRACT(HOUR FROM a.check_in)::INTEGER as checkin_hour
            FROM attendances a
            LEFT JOIN employees e ON e.id = a.employee_id
            LEFT JOIN members m ON m.id = a.member_id
            JOIN branches b ON b.id = a.branch_id
            WHERE a.check_in >= $1::date
          `;
          const params = [startDateStr];

          if (branchId) {
            checkinQuery += ` AND a.branch_id = $2::uuid`;
            params.push(branchId);
          }

          checkinQuery += ` ORDER BY a.check_in DESC LIMIT 10000`;

          const result = await database.raw(checkinQuery, params);
          data = result.rows || [];
          filename = `checkins-${new Date().toISOString().split('T')[0]}`;
          break;
        }

        default:
          return res.status(400).json({
            success: false,
            message: '無效的匯出類型',
            error_code: 'INVALID_EXPORT_TYPE'
          });
      }

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
        return res.json({
          success: true,
          exported_at: new Date().toISOString(),
          count: data.length,
          data
        });
      }

      // CSV format
      if (data.length === 0) {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        return res.send('No data available');
      }

      // Generate CSV
      const headers = Object.keys(data[0]);
      const csvRows = [
        // Add BOM for Excel UTF-8 compatibility
        '\ufeff' + headers.join(','),
        ...data.map(row =>
          headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            const stringValue = String(value);
            // Escape quotes and wrap in quotes if contains comma, quote, or newline
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          }).join(',')
        )
      ];

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csvRows.join('\n'));

    } catch (error) {
      console.error('[Dashboard] Export error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
        error_code: 'EXPORT_ERROR'
      });
    }
  });
}

export default registerDashboardRoutes;
