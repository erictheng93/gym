/**
 * Performance Routes
 * /gym/performance/*
 *
 * 績效考核管理 API
 */

import { InvalidPayloadError, NotFoundError, ForbiddenError } from '../utils/errors.js';

// Review types and statuses
const REVIEW_TYPES = ['MONTHLY', 'QUARTERLY', 'ANNUAL'];
const REVIEW_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED'];

/**
 * Register performance routes
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerPerformanceRoutes(router, context) {
  const { database } = context;

  /**
   * GET /gym/performance/reviews
   * List performance reviews
   */
  router.get('/performance/reviews', async (req, res) => {
    try {
      const {
        employee_id,
        reviewer_id,
        status,
        review_type,
        period,
        limit = 20,
        offset = 0
      } = req.query;

      let query = database('performance_reviews')
        .leftJoin('employees as employee', 'performance_reviews.employee_id', 'employee.id')
        .leftJoin('employees as reviewer', 'performance_reviews.reviewer_id', 'reviewer.id')
        .leftJoin('job_titles', 'employee.job_title_id', 'job_titles.id')
        .select(
          'performance_reviews.*',
          'employee.full_name as employee_name',
          'employee.employee_code',
          'reviewer.full_name as reviewer_name',
          'job_titles.name as job_title'
        );

      if (employee_id) {
        query = query.where('performance_reviews.employee_id', employee_id);
      }
      if (reviewer_id) {
        query = query.where('performance_reviews.reviewer_id', reviewer_id);
      }
      if (status) {
        query = query.where('performance_reviews.status', status.toUpperCase());
      }
      if (review_type) {
        query = query.where('performance_reviews.review_type', review_type.toUpperCase());
      }
      if (period) {
        query = query.where('performance_reviews.review_period', period);
      }

      const countQuery = query.clone().count('performance_reviews.id as count').first();

      query = query
        .orderBy('performance_reviews.created_at', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      const [reviews, countResult] = await Promise.all([query, countQuery]);

      res.json({
        success: true,
        data: reviews,
        meta: {
          total: parseInt(countResult?.count || 0),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/performance/reviews/:id
   * Get performance review details
   */
  router.get('/performance/reviews/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const review = await database('performance_reviews')
        .leftJoin('employees as employee', 'performance_reviews.employee_id', 'employee.id')
        .leftJoin('employees as reviewer', 'performance_reviews.reviewer_id', 'reviewer.id')
        .leftJoin('job_titles', 'employee.job_title_id', 'job_titles.id')
        .leftJoin('branches', 'employee.branch_id', 'branches.id')
        .where('performance_reviews.id', id)
        .select(
          'performance_reviews.*',
          'employee.full_name as employee_name',
          'employee.employee_code',
          'employee.email as employee_email',
          'reviewer.full_name as reviewer_name',
          'job_titles.name as job_title',
          'branches.name as branch_name'
        )
        .first();

      if (!review) {
        throw NotFoundError('Performance review not found');
      }

      // Parse KPI data
      review.kpi_data = review.kpi_data ?
        (typeof review.kpi_data === 'string' ? JSON.parse(review.kpi_data) : review.kpi_data)
        : {};

      res.json({
        success: true,
        data: review
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/performance/reviews
   * Create a new performance review
   */
  router.post('/performance/reviews', async (req, res) => {
    try {
      const {
        employee_id,
        review_period,
        review_type,
        kpi_data,
        reviewer_id
      } = req.body || {};

      // Validation
      if (!employee_id) {
        throw InvalidPayloadError('employee_id is required');
      }
      if (!review_period) {
        throw InvalidPayloadError('review_period is required (e.g., 2024-01 for monthly, 2024-Q1 for quarterly)');
      }
      if (!review_type || !REVIEW_TYPES.includes(review_type.toUpperCase())) {
        throw InvalidPayloadError(`review_type must be one of: ${REVIEW_TYPES.join(', ')}`);
      }

      // Check employee exists
      const employee = await database('employees').where('id', employee_id).first();
      if (!employee) {
        throw NotFoundError('Employee not found');
      }

      // Check for duplicate review
      const existing = await database('performance_reviews')
        .where('employee_id', employee_id)
        .where('review_period', review_period)
        .where('review_type', review_type.toUpperCase())
        .first();

      if (existing) {
        throw InvalidPayloadError('A review already exists for this employee and period');
      }

      // Get KPI template if available
      let initialKpiData = kpi_data;
      if (!initialKpiData) {
        const template = await database('kpi_templates')
          .where(function() {
            this.where('job_title_id', employee.job_title_id)
              .orWhere('is_default', true);
          })
          .where('review_type', review_type.toUpperCase())
          .where('is_active', true)
          .orderBy('job_title_id', 'desc') // Prefer job-specific template
          .first();

        if (template?.kpi_config) {
          initialKpiData = typeof template.kpi_config === 'string'
            ? JSON.parse(template.kpi_config)
            : template.kpi_config;
        } else {
          initialKpiData = [];
        }
      }

      const [review] = await database('performance_reviews')
        .insert({
          employee_id,
          review_period,
          review_type: review_type.toUpperCase(),
          kpi_data: typeof initialKpiData === 'string' ? initialKpiData : JSON.stringify(initialKpiData),
          score: null,
          reviewer_id: reviewer_id || null,
          status: 'DRAFT'
        })
        .returning('*');

      res.status(201).json({
        success: true,
        message: 'Performance review created successfully',
        data: review
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * PATCH /gym/performance/reviews/:id
   * Update performance review
   */
  router.patch('/performance/reviews/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        kpi_data,
        score,
        reviewer_comments,
        employee_comments,
        improvement_plan
      } = req.body || {};

      const existing = await database('performance_reviews').where('id', id).first();
      if (!existing) {
        throw NotFoundError('Performance review not found');
      }

      if (existing.status === 'APPROVED') {
        throw InvalidPayloadError('Cannot modify an approved review');
      }

      const updateData = {};

      if (kpi_data !== undefined) {
        updateData.kpi_data = typeof kpi_data === 'string' ? kpi_data : JSON.stringify(kpi_data);
      }
      if (score !== undefined) {
        if (score < 0 || score > 100) {
          throw InvalidPayloadError('score must be between 0 and 100');
        }
        updateData.score = parseFloat(score);
      }
      if (reviewer_comments !== undefined) updateData.reviewer_comments = reviewer_comments || null;
      if (employee_comments !== undefined) updateData.employee_comments = employee_comments || null;
      if (improvement_plan !== undefined) updateData.improvement_plan = improvement_plan || null;

      const [updated] = await database('performance_reviews')
        .where('id', id)
        .update(updateData)
        .returning('*');

      res.json({
        success: true,
        message: 'Performance review updated successfully',
        data: updated
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/performance/reviews/:id/submit
   * Submit review for approval
   */
  router.post('/performance/reviews/:id/submit', async (req, res) => {
    try {
      const { id } = req.params;
      const { reviewer_id } = req.body || {};

      const review = await database('performance_reviews').where('id', id).first();
      if (!review) {
        throw NotFoundError('Performance review not found');
      }

      if (review.status !== 'DRAFT') {
        throw InvalidPayloadError('Only draft reviews can be submitted');
      }

      // Validate that KPI data is complete
      const kpiData = review.kpi_data ?
        (typeof review.kpi_data === 'string' ? JSON.parse(review.kpi_data) : review.kpi_data)
        : [];

      if (!Array.isArray(kpiData) || kpiData.length === 0) {
        throw InvalidPayloadError('KPI data is required before submission');
      }

      const updateData = {
        status: 'SUBMITTED'
      };

      if (reviewer_id) {
        updateData.reviewer_id = reviewer_id;
      }

      const [updated] = await database('performance_reviews')
        .where('id', id)
        .update(updateData)
        .returning('*');

      res.json({
        success: true,
        message: 'Performance review submitted for approval',
        data: updated
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/performance/reviews/:id/approve
   * Approve review
   */
  router.post('/performance/reviews/:id/approve', async (req, res) => {
    try {
      const { id } = req.params;
      const { reviewer_id, final_score, reviewer_comments } = req.body || {};

      const review = await database('performance_reviews').where('id', id).first();
      if (!review) {
        throw NotFoundError('Performance review not found');
      }

      if (review.status !== 'SUBMITTED') {
        throw InvalidPayloadError('Only submitted reviews can be approved');
      }

      if (!reviewer_id) {
        throw InvalidPayloadError('reviewer_id is required');
      }

      const updateData = {
        status: 'APPROVED',
        reviewer_id,
        reviewed_at: new Date()
      };

      if (final_score !== undefined) {
        updateData.score = parseFloat(final_score);
      }
      if (reviewer_comments !== undefined) {
        updateData.reviewer_comments = reviewer_comments;
      }

      const [updated] = await database('performance_reviews')
        .where('id', id)
        .update(updateData)
        .returning('*');

      res.json({
        success: true,
        message: 'Performance review approved',
        data: updated
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/performance/reviews/:id/reject
   * Reject/return review for revision
   */
  router.post('/performance/reviews/:id/reject', async (req, res) => {
    try {
      const { id } = req.params;
      const { reviewer_id, rejection_reason } = req.body || {};

      const review = await database('performance_reviews').where('id', id).first();
      if (!review) {
        throw NotFoundError('Performance review not found');
      }

      if (review.status !== 'SUBMITTED') {
        throw InvalidPayloadError('Only submitted reviews can be rejected');
      }

      if (!rejection_reason) {
        throw InvalidPayloadError('rejection_reason is required');
      }

      const [updated] = await database('performance_reviews')
        .where('id', id)
        .update({
          status: 'DRAFT',
          reviewer_id: reviewer_id || review.reviewer_id,
          reviewer_comments: `[退回修改] ${rejection_reason}\n\n${review.reviewer_comments || ''}`
        })
        .returning('*');

      res.json({
        success: true,
        message: 'Performance review returned for revision',
        data: updated
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/performance/kpi-templates
   * List KPI templates
   */
  router.get('/performance/kpi-templates', async (req, res) => {
    try {
      const { job_title_id, review_type, is_active } = req.query;

      let query = database('kpi_templates')
        .leftJoin('job_titles', 'kpi_templates.job_title_id', 'job_titles.id')
        .leftJoin('employees', 'kpi_templates.created_by', 'employees.id')
        .select(
          'kpi_templates.*',
          'job_titles.name as job_title_name',
          'employees.full_name as created_by_name'
        );

      if (job_title_id) {
        query = query.where('kpi_templates.job_title_id', job_title_id);
      }
      if (review_type) {
        query = query.where('kpi_templates.review_type', review_type.toUpperCase());
      }
      if (is_active !== undefined) {
        query = query.where('kpi_templates.is_active', is_active === 'true');
      }

      const templates = await query.orderBy('kpi_templates.created_at', 'desc');

      // Parse kpi_config for each template
      const enrichedTemplates = templates.map(t => ({
        ...t,
        kpi_config: t.kpi_config ?
          (typeof t.kpi_config === 'string' ? JSON.parse(t.kpi_config) : t.kpi_config)
          : []
      }));

      res.json({
        success: true,
        data: enrichedTemplates
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/performance/kpi-templates
   * Create KPI template
   */
  router.post('/performance/kpi-templates', async (req, res) => {
    try {
      const {
        name,
        job_title_id,
        review_type,
        kpi_config,
        is_default,
        created_by
      } = req.body || {};

      if (!name) {
        throw InvalidPayloadError('name is required');
      }
      if (!review_type || !REVIEW_TYPES.includes(review_type.toUpperCase())) {
        throw InvalidPayloadError(`review_type must be one of: ${REVIEW_TYPES.join(', ')}`);
      }
      if (!kpi_config || (Array.isArray(kpi_config) && kpi_config.length === 0)) {
        throw InvalidPayloadError('kpi_config is required and must contain at least one KPI');
      }

      // Validate KPI config structure
      const parsedConfig = typeof kpi_config === 'string' ? JSON.parse(kpi_config) : kpi_config;
      for (const kpi of parsedConfig) {
        if (!kpi.id || !kpi.name || kpi.weight === undefined) {
          throw InvalidPayloadError('Each KPI must have id, name, and weight');
        }
      }

      // Validate total weight = 100
      const totalWeight = parsedConfig.reduce((sum, kpi) => sum + (kpi.weight || 0), 0);
      if (totalWeight !== 100) {
        throw InvalidPayloadError(`KPI weights must total 100 (current: ${totalWeight})`);
      }

      // If setting as default, remove default from others
      if (is_default) {
        await database('kpi_templates')
          .where('review_type', review_type.toUpperCase())
          .where('is_default', true)
          .update({ is_default: false });
      }

      const [template] = await database('kpi_templates')
        .insert({
          name: name.trim(),
          job_title_id: job_title_id || null,
          review_type: review_type.toUpperCase(),
          kpi_config: JSON.stringify(parsedConfig),
          is_default: is_default || false,
          is_active: true,
          created_by: created_by || null
        })
        .returning('*');

      res.status(201).json({
        success: true,
        message: 'KPI template created successfully',
        data: {
          ...template,
          kpi_config: parsedConfig
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/performance/employee/:id/history
   * Get employee's performance history
   */
  router.get('/performance/employee/:id/history', async (req, res) => {
    try {
      const { id } = req.params;
      const { limit = 12 } = req.query;

      const employee = await database('employees').where('id', id).first();
      if (!employee) {
        throw NotFoundError('Employee not found');
      }

      const reviews = await database('performance_reviews')
        .leftJoin('employees as reviewer', 'performance_reviews.reviewer_id', 'reviewer.id')
        .where('performance_reviews.employee_id', id)
        .select(
          'performance_reviews.*',
          'reviewer.full_name as reviewer_name'
        )
        .orderBy('performance_reviews.review_period', 'desc')
        .limit(parseInt(limit));

      // Calculate statistics
      const approvedReviews = reviews.filter(r => r.status === 'APPROVED' && r.score !== null);
      const stats = {
        total_reviews: reviews.length,
        approved_reviews: approvedReviews.length,
        average_score: approvedReviews.length > 0
          ? (approvedReviews.reduce((sum, r) => sum + parseFloat(r.score), 0) / approvedReviews.length).toFixed(1)
          : null,
        highest_score: approvedReviews.length > 0
          ? Math.max(...approvedReviews.map(r => parseFloat(r.score)))
          : null,
        lowest_score: approvedReviews.length > 0
          ? Math.min(...approvedReviews.map(r => parseFloat(r.score)))
          : null,
        trend: null
      };

      // Calculate trend (comparing last 2 reviews)
      if (approvedReviews.length >= 2) {
        const recent = parseFloat(approvedReviews[0].score);
        const previous = parseFloat(approvedReviews[1].score);
        stats.trend = recent > previous ? 'UP' : recent < previous ? 'DOWN' : 'STABLE';
      }

      res.json({
        success: true,
        data: {
          employee: {
            id: employee.id,
            full_name: employee.full_name,
            employee_code: employee.employee_code
          },
          statistics: stats,
          reviews: reviews.map(r => ({
            ...r,
            kpi_data: r.kpi_data ?
              (typeof r.kpi_data === 'string' ? JSON.parse(r.kpi_data) : r.kpi_data)
              : []
          }))
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/performance/team-dashboard
   * Get team performance overview
   */
  router.get('/performance/team-dashboard', async (req, res) => {
    try {
      const { branch_id, period } = req.query;

      // Get current period if not specified
      const currentPeriod = period || (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      })();

      // Get reviews for period
      let reviewsQuery = database('performance_reviews')
        .leftJoin('employees', 'performance_reviews.employee_id', 'employees.id')
        .leftJoin('job_titles', 'employees.job_title_id', 'job_titles.id')
        .where('performance_reviews.review_period', currentPeriod)
        .select(
          'performance_reviews.*',
          'employees.full_name',
          'employees.branch_id',
          'job_titles.name as job_title'
        );

      if (branch_id) {
        reviewsQuery = reviewsQuery.where('employees.branch_id', branch_id);
      }

      const reviews = await reviewsQuery;

      // Group by status
      const byStatus = {
        draft: reviews.filter(r => r.status === 'DRAFT').length,
        submitted: reviews.filter(r => r.status === 'SUBMITTED').length,
        approved: reviews.filter(r => r.status === 'APPROVED').length
      };

      // Calculate score distribution
      const approvedReviews = reviews.filter(r => r.status === 'APPROVED' && r.score !== null);
      const scoreDistribution = {
        excellent: approvedReviews.filter(r => r.score >= 90).length,
        good: approvedReviews.filter(r => r.score >= 70 && r.score < 90).length,
        average: approvedReviews.filter(r => r.score >= 50 && r.score < 70).length,
        below_average: approvedReviews.filter(r => r.score < 50).length
      };

      // Top performers
      const topPerformers = approvedReviews
        .sort((a, b) => parseFloat(b.score) - parseFloat(a.score))
        .slice(0, 5)
        .map(r => ({
          employee_id: r.employee_id,
          full_name: r.full_name,
          job_title: r.job_title,
          score: parseFloat(r.score)
        }));

      // Average score
      const averageScore = approvedReviews.length > 0
        ? (approvedReviews.reduce((sum, r) => sum + parseFloat(r.score), 0) / approvedReviews.length).toFixed(1)
        : null;

      res.json({
        success: true,
        data: {
          period: currentPeriod,
          summary: {
            total_employees: reviews.length,
            completed_reviews: approvedReviews.length,
            pending_reviews: byStatus.draft + byStatus.submitted,
            average_score: averageScore
          },
          by_status: byStatus,
          score_distribution: scoreDistribution,
          top_performers: topPerformers
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/performance/reviews/:id/calculate-kpi
   * Auto-calculate KPI actuals from data
   */
  router.post('/performance/reviews/:id/calculate-kpi', async (req, res) => {
    try {
      const { id } = req.params;

      const review = await database('performance_reviews')
        .leftJoin('employees', 'performance_reviews.employee_id', 'employees.id')
        .where('performance_reviews.id', id)
        .select('performance_reviews.*', 'employees.branch_id')
        .first();

      if (!review) {
        throw NotFoundError('Performance review not found');
      }

      // Parse period to date range
      const period = review.review_period;
      let startDate, endDate;

      if (period.includes('Q')) {
        // Quarterly: 2024-Q1
        const [year, quarter] = period.split('-Q');
        const quarterMonth = (parseInt(quarter) - 1) * 3;
        startDate = new Date(parseInt(year), quarterMonth, 1);
        endDate = new Date(parseInt(year), quarterMonth + 3, 0);
      } else if (period.length === 4) {
        // Annual: 2024
        startDate = new Date(parseInt(period), 0, 1);
        endDate = new Date(parseInt(period), 11, 31);
      } else {
        // Monthly: 2024-01
        const [year, month] = period.split('-');
        startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        endDate = new Date(parseInt(year), parseInt(month), 0);
      }

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Get actual data
      const [contractsResult, revenueResult, leadsResult, checkinResult] = await Promise.all([
        // New contracts by this employee
        database('contracts')
          .where('sales_person_id', review.employee_id)
          .whereBetween('date_created', [startDateStr, endDateStr])
          .count('* as count')
          .first(),

        // Revenue from contracts
        database('contracts')
          .where('sales_person_id', review.employee_id)
          .whereBetween('date_created', [startDateStr, endDateStr])
          .sum('total_amount as total')
          .first(),

        // Lead conversions
        database('leads')
          .where('assigned_to', review.employee_id)
          .where('status', 'CONVERTED')
          .whereBetween('converted_at', [startDateStr, endDateStr])
          .count('* as count')
          .first(),

        // Total leads assigned
        database('leads')
          .where('assigned_to', review.employee_id)
          .whereBetween('created_at', [startDateStr, endDateStr])
          .count('* as count')
          .first()
      ]);

      const actuals = {
        new_contracts: parseInt(contractsResult?.count || 0),
        revenue: parseFloat(revenueResult?.total || 0),
        lead_conversions: parseInt(leadsResult?.count || 0),
        total_leads: parseInt(checkinResult?.count || 0),
        conversion_rate: parseInt(checkinResult?.count || 0) > 0
          ? ((parseInt(leadsResult?.count || 0) / parseInt(checkinResult?.count || 0)) * 100).toFixed(1)
          : 0
      };

      // Update KPI data with actuals
      const kpiData = review.kpi_data ?
        (typeof review.kpi_data === 'string' ? JSON.parse(review.kpi_data) : review.kpi_data)
        : [];

      const updatedKpiData = kpiData.map(kpi => {
        const actual = actuals[kpi.id];
        if (actual !== undefined) {
          return {
            ...kpi,
            actual,
            achievement: kpi.target > 0 ? ((actual / kpi.target) * 100).toFixed(1) : 0
          };
        }
        return kpi;
      });

      // Calculate weighted score
      const totalScore = updatedKpiData.reduce((sum, kpi) => {
        const achievement = parseFloat(kpi.achievement || 0);
        const weightedScore = Math.min(achievement, 100) * (kpi.weight / 100);
        return sum + weightedScore;
      }, 0);

      const [updated] = await database('performance_reviews')
        .where('id', id)
        .update({
          kpi_data: JSON.stringify(updatedKpiData),
          score: totalScore.toFixed(1)
        })
        .returning('*');

      res.json({
        success: true,
        message: 'KPI calculated successfully',
        data: {
          ...updated,
          kpi_data: updatedKpiData,
          actuals
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerPerformanceRoutes;
