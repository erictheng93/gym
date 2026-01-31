/**
 * Campaigns Routes
 * /gym/campaigns/*
 *
 * 行銷活動管理 API
 */

import { InvalidPayloadError, NotFoundError } from '../utils/errors.js';

// Campaign types and statuses
const CAMPAIGN_TYPES = ['PROMOTION', 'EVENT', 'CHECKIN', 'REFERRAL'];
const CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED'];

/**
 * Register campaigns routes
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerCampaignsRoutes(router, context) {
  const { database } = context;

  /**
   * GET /gym/campaigns
   * List campaigns
   */
  router.get('/campaigns', async (req, res) => {
    try {
      const { type, status, search, limit = 20, offset = 0 } = req.query;

      let query = database('campaigns')
        .leftJoin('employees', 'campaigns.created_by', 'employees.id')
        .select(
          'campaigns.*',
          'employees.full_name as created_by_name'
        );

      if (type) {
        query = query.where('campaigns.type', type.toUpperCase());
      }
      if (status) {
        query = query.where('campaigns.status', status.toUpperCase());
      }
      if (search) {
        query = query.where(function() {
          this.where('campaigns.name', 'ilike', `%${search}%`)
            .orWhere('campaigns.description', 'ilike', `%${search}%`);
        });
      }

      const countQuery = query.clone().count('campaigns.id as count').first();

      query = query
        .orderBy('campaigns.created_at', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      const [campaigns, countResult] = await Promise.all([query, countQuery]);

      // Add computed status based on dates
      const now = new Date();
      const enrichedCampaigns = campaigns.map(c => {
        let computedStatus = c.status;
        if (c.status === 'ACTIVE') {
          if (new Date(c.start_date) > now) {
            computedStatus = 'SCHEDULED';
          } else if (new Date(c.end_date) < now) {
            computedStatus = 'ENDED';
          }
        }
        return {
          ...c,
          computed_status: computedStatus,
          is_running: c.status === 'ACTIVE' &&
            new Date(c.start_date) <= now &&
            new Date(c.end_date) >= now
        };
      });

      res.json({
        success: true,
        data: enrichedCampaigns,
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
   * GET /gym/campaigns/:id
   * Get campaign details
   */
  router.get('/campaigns/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const campaign = await database('campaigns')
        .leftJoin('employees', 'campaigns.created_by', 'employees.id')
        .where('campaigns.id', id)
        .select(
          'campaigns.*',
          'employees.full_name as created_by_name'
        )
        .first();

      if (!campaign) {
        throw NotFoundError('Campaign not found');
      }

      // Get associated coupons
      const coupons = await database('coupons')
        .whereRaw("applicable_plans::text LIKE ?", [`%${id}%`])
        .orWhere('name', 'ilike', `%${campaign.name}%`)
        .select('id', 'code', 'name', 'discount_type', 'discount_value', 'used_count');

      // Get marketing assets
      const assets = await database('marketing_assets')
        .whereRaw("tags::text LIKE ?", [`%${id}%`])
        .select('id', 'name', 'type', 'file_id');

      res.json({
        success: true,
        data: {
          ...campaign,
          coupons,
          assets
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
   * POST /gym/campaigns
   * Create a new campaign
   */
  router.post('/campaigns', async (req, res) => {
    try {
      const {
        name,
        type,
        description,
        start_date,
        end_date,
        target_audience,
        budget,
        created_by
      } = req.body || {};

      // Validation
      if (!name || name.trim().length === 0) {
        throw InvalidPayloadError('name is required');
      }
      if (!type || !CAMPAIGN_TYPES.includes(type.toUpperCase())) {
        throw InvalidPayloadError(`type must be one of: ${CAMPAIGN_TYPES.join(', ')}`);
      }
      if (!start_date) {
        throw InvalidPayloadError('start_date is required');
      }
      if (!end_date) {
        throw InvalidPayloadError('end_date is required');
      }
      if (new Date(end_date) <= new Date(start_date)) {
        throw InvalidPayloadError('end_date must be after start_date');
      }

      const [campaign] = await database('campaigns')
        .insert({
          name: name.trim(),
          type: type.toUpperCase(),
          description: description || null,
          start_date: new Date(start_date),
          end_date: new Date(end_date),
          target_audience: target_audience ?
            (typeof target_audience === 'string' ? JSON.parse(target_audience) : target_audience) : null,
          budget: budget ? parseFloat(budget) : null,
          actual_cost: 0,
          status: 'DRAFT',
          metrics: JSON.stringify({
            impressions: 0,
            clicks: 0,
            conversions: 0,
            revenue: 0
          }),
          created_by: created_by || null
        })
        .returning('*');

      res.status(201).json({
        success: true,
        message: 'Campaign created successfully',
        data: campaign
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * PATCH /gym/campaigns/:id
   * Update campaign
   */
  router.patch('/campaigns/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        type,
        description,
        start_date,
        end_date,
        target_audience,
        budget,
        actual_cost,
        status,
        metrics
      } = req.body || {};

      const existing = await database('campaigns').where('id', id).first();
      if (!existing) {
        throw NotFoundError('Campaign not found');
      }

      const updateData = {};

      if (name !== undefined) updateData.name = name.trim();
      if (type !== undefined) {
        if (!CAMPAIGN_TYPES.includes(type.toUpperCase())) {
          throw InvalidPayloadError(`type must be one of: ${CAMPAIGN_TYPES.join(', ')}`);
        }
        updateData.type = type.toUpperCase();
      }
      if (description !== undefined) updateData.description = description || null;
      if (start_date !== undefined) updateData.start_date = new Date(start_date);
      if (end_date !== undefined) updateData.end_date = new Date(end_date);
      if (target_audience !== undefined) {
        updateData.target_audience = target_audience ?
          (typeof target_audience === 'string' ? JSON.parse(target_audience) : target_audience) : null;
      }
      if (budget !== undefined) updateData.budget = budget ? parseFloat(budget) : null;
      if (actual_cost !== undefined) updateData.actual_cost = parseFloat(actual_cost) || 0;
      if (status !== undefined) {
        if (!CAMPAIGN_STATUSES.includes(status.toUpperCase())) {
          throw InvalidPayloadError(`status must be one of: ${CAMPAIGN_STATUSES.join(', ')}`);
        }
        updateData.status = status.toUpperCase();
      }
      if (metrics !== undefined) {
        updateData.metrics = typeof metrics === 'string' ? metrics : JSON.stringify(metrics);
      }

      const [updated] = await database('campaigns')
        .where('id', id)
        .update(updateData)
        .returning('*');

      res.json({
        success: true,
        message: 'Campaign updated successfully',
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
   * DELETE /gym/campaigns/:id
   * Archive campaign
   */
  router.delete('/campaigns/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await database('campaigns').where('id', id).first();
      if (!existing) {
        throw NotFoundError('Campaign not found');
      }

      const [updated] = await database('campaigns')
        .where('id', id)
        .update({ status: 'CANCELLED' })
        .returning('*');

      res.json({
        success: true,
        message: 'Campaign cancelled',
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
   * GET /gym/campaigns/:id/metrics
   * Get campaign performance metrics
   */
  router.get('/campaigns/:id/metrics', async (req, res) => {
    try {
      const { id } = req.params;

      const campaign = await database('campaigns').where('id', id).first();
      if (!campaign) {
        throw NotFoundError('Campaign not found');
      }

      const metrics = campaign.metrics ?
        (typeof campaign.metrics === 'string' ? JSON.parse(campaign.metrics) : campaign.metrics)
        : {};

      // Calculate ROI if we have budget and revenue
      let roi = null;
      if (campaign.actual_cost > 0 && metrics.revenue) {
        roi = ((metrics.revenue - campaign.actual_cost) / campaign.actual_cost * 100).toFixed(2);
      }

      // Calculate conversion rate
      let conversionRate = null;
      if (metrics.clicks > 0) {
        conversionRate = ((metrics.conversions / metrics.clicks) * 100).toFixed(2);
      }

      // Get leads generated during campaign period
      const leadsCount = await database('leads')
        .where('utm_campaign', campaign.name)
        .orWhereBetween('created_at', [campaign.start_date, campaign.end_date])
        .count('* as count')
        .first();

      // Get contracts created during campaign
      const contractsCount = await database('contracts')
        .whereBetween('date_created', [campaign.start_date, campaign.end_date])
        .count('* as count')
        .first();

      // Get revenue from contracts during campaign
      const revenueResult = await database('contracts')
        .whereBetween('date_created', [campaign.start_date, campaign.end_date])
        .sum('total_amount as total')
        .first();

      res.json({
        success: true,
        data: {
          campaign_id: id,
          campaign_name: campaign.name,
          period: {
            start_date: campaign.start_date,
            end_date: campaign.end_date
          },
          budget: campaign.budget,
          actual_cost: campaign.actual_cost,
          metrics: {
            ...metrics,
            leads_generated: parseInt(leadsCount?.count || 0),
            contracts_created: parseInt(contractsCount?.count || 0),
            revenue_generated: parseFloat(revenueResult?.total || 0),
            roi: roi ? `${roi}%` : null,
            conversion_rate: conversionRate ? `${conversionRate}%` : null
          }
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
   * POST /gym/campaigns/:id/assets
   * Add marketing asset to campaign
   */
  router.post('/campaigns/:id/assets', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        type,
        category,
        file_id,
        content,
        created_by
      } = req.body || {};

      const campaign = await database('campaigns').where('id', id).first();
      if (!campaign) {
        throw NotFoundError('Campaign not found');
      }

      const validTypes = ['IMAGE', 'VIDEO', 'COPY', 'TEMPLATE'];
      if (!type || !validTypes.includes(type.toUpperCase())) {
        throw InvalidPayloadError(`type must be one of: ${validTypes.join(', ')}`);
      }
      if (!name) {
        throw InvalidPayloadError('name is required');
      }

      const [asset] = await database('marketing_assets')
        .insert({
          name: name.trim(),
          type: type.toUpperCase(),
          category: category || 'campaign',
          file_id: file_id || null,
          content: content || null,
          tags: JSON.stringify([id, campaign.name]),
          usage_stats: JSON.stringify({ views: 0, downloads: 0 }),
          is_active: true,
          created_by: created_by || null
        })
        .returning('*');

      res.status(201).json({
        success: true,
        message: 'Asset added successfully',
        data: asset
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/campaigns/roi-report
   * Get ROI report across all campaigns
   */
  router.get('/campaigns/roi-report', async (req, res) => {
    try {
      const { start_date, end_date, type } = req.query;

      const endDate = end_date || new Date().toISOString().split('T')[0];
      const startDate = start_date || (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 6);
        return d.toISOString().split('T')[0];
      })();

      let query = database('campaigns')
        .where('status', '!=', 'DRAFT')
        .where('start_date', '>=', startDate)
        .where('start_date', '<=', endDate)
        .select('*');

      if (type) {
        query = query.where('type', type.toUpperCase());
      }

      const campaigns = await query.orderBy('start_date', 'desc');

      // Calculate ROI for each campaign
      const report = await Promise.all(campaigns.map(async (c) => {
        const metrics = c.metrics ?
          (typeof c.metrics === 'string' ? JSON.parse(c.metrics) : c.metrics)
          : {};

        // Get actual revenue from contracts during campaign
        const revenueResult = await database('contracts')
          .whereBetween('date_created', [c.start_date, c.end_date])
          .sum('total_amount as total')
          .first();

        const revenue = parseFloat(revenueResult?.total || 0) || parseFloat(metrics.revenue || 0);
        const cost = parseFloat(c.actual_cost || 0);

        let roi = null;
        if (cost > 0) {
          roi = ((revenue - cost) / cost * 100).toFixed(2);
        }

        return {
          id: c.id,
          name: c.name,
          type: c.type,
          status: c.status,
          period: {
            start: c.start_date,
            end: c.end_date
          },
          budget: c.budget,
          actual_cost: cost,
          revenue,
          profit: revenue - cost,
          roi: roi ? parseFloat(roi) : null,
          conversions: metrics.conversions || 0
        };
      }));

      // Summary statistics
      const summary = {
        total_campaigns: report.length,
        total_budget: report.reduce((sum, r) => sum + (parseFloat(r.budget) || 0), 0),
        total_cost: report.reduce((sum, r) => sum + r.actual_cost, 0),
        total_revenue: report.reduce((sum, r) => sum + r.revenue, 0),
        total_profit: report.reduce((sum, r) => sum + r.profit, 0),
        total_conversions: report.reduce((sum, r) => sum + r.conversions, 0),
        average_roi: null,
        best_performing: null,
        worst_performing: null
      };

      const campaignsWithRoi = report.filter(r => r.roi !== null);
      if (campaignsWithRoi.length > 0) {
        summary.average_roi = (campaignsWithRoi.reduce((sum, r) => sum + r.roi, 0) / campaignsWithRoi.length).toFixed(2);
        summary.best_performing = campaignsWithRoi.reduce((best, r) => r.roi > best.roi ? r : best);
        summary.worst_performing = campaignsWithRoi.reduce((worst, r) => r.roi < worst.roi ? r : worst);
      }

      res.json({
        success: true,
        period: { start_date: startDate, end_date: endDate },
        summary,
        data: report
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/campaigns/:id/update-metrics
   * Update campaign metrics (for tracking integrations)
   */
  router.post('/campaigns/:id/update-metrics', async (req, res) => {
    try {
      const { id } = req.params;
      const { impressions, clicks, conversions, revenue, actual_cost } = req.body || {};

      const campaign = await database('campaigns').where('id', id).first();
      if (!campaign) {
        throw NotFoundError('Campaign not found');
      }

      const currentMetrics = campaign.metrics ?
        (typeof campaign.metrics === 'string' ? JSON.parse(campaign.metrics) : campaign.metrics)
        : {};

      const updatedMetrics = {
        impressions: impressions !== undefined ? parseInt(impressions) : (currentMetrics.impressions || 0),
        clicks: clicks !== undefined ? parseInt(clicks) : (currentMetrics.clicks || 0),
        conversions: conversions !== undefined ? parseInt(conversions) : (currentMetrics.conversions || 0),
        revenue: revenue !== undefined ? parseFloat(revenue) : (currentMetrics.revenue || 0),
        updated_at: new Date().toISOString()
      };

      const updateData = {
        metrics: JSON.stringify(updatedMetrics)
      };

      if (actual_cost !== undefined) {
        updateData.actual_cost = parseFloat(actual_cost);
      }

      const [updated] = await database('campaigns')
        .where('id', id)
        .update(updateData)
        .returning('*');

      res.json({
        success: true,
        message: 'Metrics updated successfully',
        data: {
          ...updated,
          metrics: updatedMetrics
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

export default registerCampaignsRoutes;
