/**
 * Reports Routes
 * /gym/reports/*
 */

import {
  getCachedReport,
  setCachedReport,
  invalidateReportCache,
} from '../utils/redis.js';

/**
 * 註冊報表路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerReportsRoutes(router, context) {
  const { database } = context;

  /**
   * GET /gym/reports/revenue
   * 營收報表
   */
  router.get('/reports/revenue', async (req, res) => {
    try {
      const { start_date, end_date, branch_id } = req.query;

      const endDate = end_date || new Date().toISOString().split('T')[0];
      const startDate = start_date || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
      })();

      const cacheKey = `${startDate}_${endDate}_${branch_id || 'all'}`;
      const cached = await getCachedReport('revenue', cacheKey);
      if (cached) {
        return res.json(cached);
      }

      let query = `
        SELECT * FROM revenue_daily_summary
        WHERE payment_day BETWEEN ?::date AND ?::date
      `;
      const params = [startDate, endDate];

      if (branch_id) {
        query += ` AND branch_id = ?::uuid`;
        params.push(branch_id);
      }
      query += ` ORDER BY payment_day DESC`;

      const result = await database.raw(query, params);
      const rows = result.rows || result;

      const totals = rows.reduce((acc, row) => ({
        total_income: (acc.total_income || 0) + parseFloat(row.total_income || 0),
        total_refund: (acc.total_refund || 0) + parseFloat(row.total_refund || 0),
        net_revenue: (acc.net_revenue || 0) + parseFloat(row.net_revenue || 0),
        transaction_count: (acc.transaction_count || 0) + parseInt(row.transaction_count || 0),
      }), {});

      const response = {
        success: true,
        period: { start_date: startDate, end_date: endDate },
        summary: {
          total_income: totals.total_income || 0,
          total_refund: totals.total_refund || 0,
          net_revenue: totals.net_revenue || 0,
          total_transactions: totals.transaction_count || 0,
          average_daily_revenue: rows.length > 0 ? (totals.net_revenue / rows.length).toFixed(2) : 0,
        },
        data: rows,
      };

      await setCachedReport('revenue', cacheKey, response);
      res.json(response);
    } catch (error) {
      // Error logged('[GymEndpoint] Revenue report error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/reports/member-growth
   * 會員成長報表
   */
  router.get('/reports/member-growth', async (req, res) => {
    try {
      const { start_date, end_date, branch_id } = req.query;

      const endDate = end_date || new Date().toISOString().split('T')[0];
      const startDate = start_date || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
      })();

      const cacheKey = `${startDate}_${endDate}_${branch_id || 'all'}`;
      const cached = await getCachedReport('member-growth', cacheKey);
      if (cached) return res.json(cached);

      let query = `
        SELECT * FROM member_growth_summary
        WHERE join_day BETWEEN ?::date AND ?::date
      `;
      const params = [startDate, endDate];

      if (branch_id) {
        query += ` AND branch_id = ?::uuid`;
        params.push(branch_id);
      }
      query += ` ORDER BY join_day DESC`;

      const result = await database.raw(query, params);
      const rows = result.rows || result;

      const totals = rows.reduce((acc, row) => ({
        total_new_members: (acc.total_new_members || 0) + parseInt(row.new_members || 0),
        total_male: (acc.total_male || 0) + parseInt(row.male_count || 0),
        total_female: (acc.total_female || 0) + parseInt(row.female_count || 0),
      }), {});

      const totalMembersResult = await database.raw(`
        SELECT COUNT(*) as count FROM members WHERE status = 'active'
        ${branch_id ? `AND branch_id = ?::uuid` : ''}
      `, branch_id ? [branch_id] : []);

      const totalMembers = parseInt((totalMembersResult.rows?.[0] || totalMembersResult[0])?.count || 0);

      const response = {
        success: true,
        period: { start_date: startDate, end_date: endDate },
        summary: {
          total_new_members: totals.total_new_members || 0,
          total_members: totalMembers,
          average_daily_growth: rows.length > 0 ? (totals.total_new_members / rows.length).toFixed(2) : 0,
          gender_distribution: { male: totals.total_male || 0, female: totals.total_female || 0 },
        },
        data: rows,
      };

      await setCachedReport('member-growth', cacheKey, response);
      res.json(response);
    } catch (error) {
      // Error logged('[GymEndpoint] Member growth report error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * GET /gym/reports/contract-expiry
   * 合約到期提醒報表
   */
  router.get('/reports/contract-expiry', async (req, res) => {
    try {
      const { days_ahead = 30, branch_id, limit = 100 } = req.query;

      const cacheKey = `${days_ahead}_${branch_id || 'all'}_${limit}`;
      const cached = await getCachedReport('contract-expiry', cacheKey);
      if (cached) return res.json(cached);

      let query = `SELECT * FROM contract_expiry_alerts WHERE days_until_expiry <= ?::integer`;
      const params = [parseInt(days_ahead)];

      if (branch_id) {
        query += ` AND branch_id = ?::uuid`;
        params.push(branch_id);
      }
      query += ` ORDER BY days_until_expiry ASC LIMIT ?::integer`;
      params.push(parseInt(limit));

      const result = await database.raw(query, params);
      const rows = result.rows || result;

      const groupedData = {
        urgent: rows.filter(r => r.days_until_expiry <= 7),
        soon: rows.filter(r => r.days_until_expiry > 7 && r.days_until_expiry <= 30),
        upcoming: rows.filter(r => r.days_until_expiry > 30),
      };

      const response = {
        success: true,
        summary: {
          total_expiring: rows.length,
          urgent_count: groupedData.urgent.length,
          soon_count: groupedData.soon.length,
          upcoming_count: groupedData.upcoming.length,
        },
        grouped: groupedData,
        data: rows,
      };

      await setCachedReport('contract-expiry', cacheKey, response);
      res.json(response);
    } catch (error) {
      // Error logged('[GymEndpoint] Contract expiry report error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * GET /gym/reports/member-activity
   * 會員活躍度報表
   */
  router.get('/reports/member-activity', async (req, res) => {
    try {
      const { start_date, end_date, branch_id } = req.query;

      const endDate = end_date || new Date().toISOString().split('T')[0];
      const startDate = start_date || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
      })();

      const cacheKey = `${startDate}_${endDate}_${branch_id || 'all'}`;
      const cached = await getCachedReport('member-activity', cacheKey);
      if (cached) return res.json(cached);

      let query = `
        SELECT * FROM member_activity_summary
        WHERE activity_day BETWEEN ?::date AND ?::date
      `;
      const params = [startDate, endDate];

      if (branch_id) {
        query += ` AND branch_id = ?::uuid`;
        params.push(branch_id);
      }
      query += ` ORDER BY activity_day DESC`;

      const result = await database.raw(query, params);
      const rows = result.rows || result;

      const totals = rows.reduce((acc, row) => ({
        total_check_ins: (acc.total_check_ins || 0) + parseInt(row.total_check_ins || 0),
        qr_code_total: (acc.qr_code_total || 0) + parseInt(row.qr_code_count || 0),
        manual_total: (acc.manual_total || 0) + parseInt(row.manual_count || 0),
        card_total: (acc.card_total || 0) + parseInt(row.card_count || 0),
      }), {});

      const response = {
        success: true,
        period: { start_date: startDate, end_date: endDate },
        summary: {
          total_check_ins: totals.total_check_ins || 0,
          average_daily_check_ins: rows.length > 0 ? (totals.total_check_ins / rows.length).toFixed(2) : 0,
          method_distribution: {
            qr_code: totals.qr_code_total || 0,
            manual: totals.manual_total || 0,
            card: totals.card_total || 0,
          },
        },
        data: rows,
      };

      await setCachedReport('member-activity', cacheKey, response);
      res.json(response);
    } catch (error) {
      // Error logged('[GymEndpoint] Member activity report error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * POST /gym/reports/refresh
   * 刷新報表物化視圖 (admin only)
   */
  router.post('/reports/refresh', async (req, res) => {
    try {
      const userId = req.accountability?.user;
      if (!userId) {
        return res.status(401).json({ success: false, message: '請先登入' });
      }

      const isDirectusAdmin = req.accountability?.admin === true;

      if (!isDirectusAdmin) {
        const permissionResult = await database.raw(`
          SELECT COALESCE(e.custom_permissions, jt.permissions_config) as permissions
          FROM employees e
          LEFT JOIN job_titles jt ON jt.id = e.job_title_id
          WHERE e.user_id = $1 AND e.status = 'active'
          LIMIT 1
        `, [userId]);

        const employee = permissionResult.rows?.[0];
        const permissions = employee?.permissions || {};

        if (!permissions?.reports?.manage) {
          return res.status(403).json({ success: false, message: '權限不足' });
        }
      }

      await database.raw('SELECT refresh_report_views()');
      await invalidateReportCache();

      res.json({
        success: true,
        message: '報表資料已更新',
        refreshed_at: new Date().toISOString(),
        cache_cleared: true,
      });
    } catch (error) {
      // Error logged('[GymEndpoint] Refresh reports error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });
}

export default registerReportsRoutes;
