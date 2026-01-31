/**
 * Leads Routes
 * /gym/leads/*
 *
 * 潛在客戶管理 API
 */

import { InvalidPayloadError, NotFoundError, ForbiddenError } from '../utils/errors.js';

/**
 * Register leads routes
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerLeadsRoutes(router, context) {
  const { database } = context;

  // Valid status values
  const VALID_STATUSES = ['NEW', 'CONTACTED', 'TRIAL_BOOKED', 'VISITED', 'CONVERTED', 'LOST'];
  const VALID_SOURCES = ['FB_AD', 'IG_AD', 'GOOGLE_AD', 'WEBSITE', 'WALK_IN', 'REFERRAL'];
  const VALID_ACTIVITY_TYPES = ['CALL', 'SMS', 'EMAIL', 'VISIT', 'TRIAL'];

  // Status transition rules
  const VALID_TRANSITIONS = {
    'NEW': ['CONTACTED', 'LOST'],
    'CONTACTED': ['TRIAL_BOOKED', 'VISITED', 'LOST'],
    'TRIAL_BOOKED': ['VISITED', 'LOST'],
    'VISITED': ['CONVERTED', 'LOST'],
    'CONVERTED': [],
    'LOST': ['NEW'] // Allow reactivation
  };

  /**
   * GET /gym/leads
   * List leads with filtering
   */
  router.get('/leads', async (req, res) => {
    try {
      const {
        status,
        source,
        assigned_to,
        branch_id,
        search,
        limit = 20,
        offset = 0,
        sort = '-created_at'
      } = req.query;

      let query = database('leads')
        .leftJoin('employees as assignee', 'leads.assigned_to', 'assignee.id')
        .leftJoin('branches', 'leads.branch_id', 'branches.id')
        .select(
          'leads.*',
          'assignee.full_name as assigned_to_name',
          'branches.name as branch_name'
        );

      // Apply filters
      if (status) {
        query = query.where('leads.status', status.toUpperCase());
      }
      if (source) {
        query = query.where('leads.source', source.toUpperCase());
      }
      if (assigned_to) {
        query = query.where('leads.assigned_to', assigned_to);
      }
      if (branch_id) {
        query = query.where('leads.branch_id', branch_id);
      }
      if (search) {
        query = query.where(function() {
          this.where('leads.name', 'ilike', `%${search}%`)
            .orWhere('leads.phone', 'ilike', `%${search}%`)
            .orWhere('leads.email', 'ilike', `%${search}%`);
        });
      }

      // Count total
      const countQuery = query.clone().count('leads.id as count').first();

      // Apply sorting
      const sortField = sort.startsWith('-') ? sort.slice(1) : sort;
      const sortOrder = sort.startsWith('-') ? 'desc' : 'asc';
      query = query.orderBy(`leads.${sortField}`, sortOrder);

      // Apply pagination
      query = query.limit(parseInt(limit)).offset(parseInt(offset));

      const [leads, countResult] = await Promise.all([query, countQuery]);

      res.json({
        success: true,
        data: leads,
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
   * GET /gym/leads/:id
   * Get lead details with activities
   */
  router.get('/leads/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const lead = await database('leads')
        .leftJoin('employees as assignee', 'leads.assigned_to', 'assignee.id')
        .leftJoin('branches', 'leads.branch_id', 'branches.id')
        .leftJoin('members', 'leads.converted_member_id', 'members.id')
        .where('leads.id', id)
        .select(
          'leads.*',
          'assignee.full_name as assigned_to_name',
          'branches.name as branch_name',
          'members.full_name as converted_member_name',
          'members.member_code as converted_member_code'
        )
        .first();

      if (!lead) {
        throw NotFoundError('Lead not found');
      }

      // Get activities
      const activities = await database('lead_activities')
        .leftJoin('employees', 'lead_activities.created_by', 'employees.id')
        .where('lead_id', id)
        .select(
          'lead_activities.*',
          'employees.full_name as created_by_name'
        )
        .orderBy('created_at', 'desc');

      res.json({
        success: true,
        data: {
          ...lead,
          activities
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
   * POST /gym/leads
   * Create a new lead
   */
  router.post('/leads', async (req, res) => {
    try {
      const {
        name,
        phone,
        email,
        source,
        branch_id,
        assigned_to,
        utm_source,
        utm_medium,
        utm_campaign,
        interest,
        notes
      } = req.body || {};

      // Validation
      if (!name || name.trim().length === 0) {
        throw InvalidPayloadError('name is required');
      }
      if (!phone || phone.trim().length === 0) {
        throw InvalidPayloadError('phone is required');
      }
      if (!source || !VALID_SOURCES.includes(source.toUpperCase())) {
        throw InvalidPayloadError(`source must be one of: ${VALID_SOURCES.join(', ')}`);
      }
      if (!branch_id) {
        throw InvalidPayloadError('branch_id is required');
      }

      // Check for duplicate phone in same branch
      const existing = await database('leads')
        .where('phone', phone)
        .where('branch_id', branch_id)
        .whereNotIn('status', ['CONVERTED', 'LOST'])
        .first();

      if (existing) {
        throw InvalidPayloadError('A lead with this phone number already exists in this branch');
      }

      const [lead] = await database('leads')
        .insert({
          name: name.trim(),
          phone: phone.trim(),
          email: email?.trim() || null,
          source: source.toUpperCase(),
          branch_id,
          assigned_to: assigned_to || null,
          utm_source: utm_source || null,
          utm_medium: utm_medium || null,
          utm_campaign: utm_campaign || null,
          interest: interest ? (typeof interest === 'string' ? JSON.parse(interest) : interest) : null,
          notes: notes || null,
          status: 'NEW'
        })
        .returning('*');

      // Auto-create initial activity
      await database('lead_activities').insert({
        lead_id: lead.id,
        activity_type: 'VISIT',
        content: `Lead created from ${source}`,
        created_by: assigned_to || null
      });

      res.status(201).json({
        success: true,
        message: 'Lead created successfully',
        data: lead
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * PATCH /gym/leads/:id
   * Update lead (with status transition validation)
   */
  router.patch('/leads/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        phone,
        email,
        status,
        assigned_to,
        interest,
        notes
      } = req.body || {};

      const existing = await database('leads').where('id', id).first();
      if (!existing) {
        throw NotFoundError('Lead not found');
      }

      const updateData = { updated_at: new Date() };

      if (name !== undefined) updateData.name = name.trim();
      if (phone !== undefined) updateData.phone = phone.trim();
      if (email !== undefined) updateData.email = email?.trim() || null;
      if (assigned_to !== undefined) updateData.assigned_to = assigned_to || null;
      if (interest !== undefined) {
        updateData.interest = interest ? (typeof interest === 'string' ? JSON.parse(interest) : interest) : null;
      }
      if (notes !== undefined) updateData.notes = notes || null;

      // Validate status transition
      if (status && status.toUpperCase() !== existing.status) {
        const newStatus = status.toUpperCase();
        if (!VALID_STATUSES.includes(newStatus)) {
          throw InvalidPayloadError(`status must be one of: ${VALID_STATUSES.join(', ')}`);
        }

        const allowedTransitions = VALID_TRANSITIONS[existing.status] || [];
        if (!allowedTransitions.includes(newStatus)) {
          throw InvalidPayloadError(
            `Cannot transition from ${existing.status} to ${newStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`
          );
        }
        updateData.status = newStatus;
      }

      const [updated] = await database('leads')
        .where('id', id)
        .update(updateData)
        .returning('*');

      res.json({
        success: true,
        message: 'Lead updated successfully',
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
   * DELETE /gym/leads/:id
   * Soft delete (mark as LOST)
   */
  router.delete('/leads/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await database('leads').where('id', id).first();
      if (!existing) {
        throw NotFoundError('Lead not found');
      }

      if (existing.status === 'CONVERTED') {
        throw InvalidPayloadError('Cannot delete a converted lead');
      }

      const [updated] = await database('leads')
        .where('id', id)
        .update({
          status: 'LOST',
          updated_at: new Date()
        })
        .returning('*');

      res.json({
        success: true,
        message: 'Lead marked as lost',
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
   * POST /gym/leads/:id/activities
   * Add follow-up activity
   */
  router.post('/leads/:id/activities', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        activity_type,
        content,
        result,
        next_action,
        next_action_date,
        created_by
      } = req.body || {};

      const lead = await database('leads').where('id', id).first();
      if (!lead) {
        throw NotFoundError('Lead not found');
      }

      if (!activity_type || !VALID_ACTIVITY_TYPES.includes(activity_type.toUpperCase())) {
        throw InvalidPayloadError(`activity_type must be one of: ${VALID_ACTIVITY_TYPES.join(', ')}`);
      }
      if (!content || content.trim().length === 0) {
        throw InvalidPayloadError('content is required');
      }

      const [activity] = await database('lead_activities')
        .insert({
          lead_id: id,
          activity_type: activity_type.toUpperCase(),
          content: content.trim(),
          result: result || null,
          next_action: next_action || null,
          next_action_date: next_action_date || null,
          created_by: created_by || null
        })
        .returning('*');

      // Auto-update lead status if it's still NEW and first contact made
      if (lead.status === 'NEW' && ['CALL', 'SMS', 'EMAIL'].includes(activity_type.toUpperCase())) {
        await database('leads')
          .where('id', id)
          .update({
            status: 'CONTACTED',
            updated_at: new Date()
          });
      }

      res.status(201).json({
        success: true,
        message: 'Activity added successfully',
        data: activity
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/leads/:id/convert
   * Convert lead to member
   */
  router.post('/leads/:id/convert', async (req, res) => {
    try {
      const { id } = req.params;
      const { converted_by } = req.body || {};

      const lead = await database('leads').where('id', id).first();
      if (!lead) {
        throw NotFoundError('Lead not found');
      }

      if (lead.status === 'CONVERTED') {
        throw InvalidPayloadError('Lead is already converted');
      }
      if (lead.status === 'LOST') {
        throw InvalidPayloadError('Cannot convert a lost lead');
      }

      // Check if member with same phone already exists
      const existingMember = await database('members')
        .where('phone', lead.phone)
        .first();

      if (existingMember) {
        // Link to existing member
        const [updated] = await database('leads')
          .where('id', id)
          .update({
            status: 'CONVERTED',
            converted_member_id: existingMember.id,
            converted_at: new Date(),
            updated_at: new Date()
          })
          .returning('*');

        // Add conversion activity
        await database('lead_activities').insert({
          lead_id: id,
          activity_type: 'VISIT',
          content: `Lead converted - linked to existing member ${existingMember.member_code}`,
          created_by: converted_by || null
        });

        return res.json({
          success: true,
          message: 'Lead converted and linked to existing member',
          data: {
            lead: updated,
            member: existingMember,
            is_new_member: false
          }
        });
      }

      // Create new member
      const memberCode = `M${Date.now().toString(36).toUpperCase()}`;

      const [newMember] = await database('members')
        .insert({
          member_code: memberCode,
          full_name: lead.name,
          phone: lead.phone,
          email: lead.email,
          branch_id: lead.branch_id,
          status: 'active',
          join_date: new Date().toISOString().split('T')[0],
          source: lead.source
        })
        .returning('*');

      // Update lead
      const [updated] = await database('leads')
        .where('id', id)
        .update({
          status: 'CONVERTED',
          converted_member_id: newMember.id,
          converted_at: new Date(),
          updated_at: new Date()
        })
        .returning('*');

      // Add conversion activity
      await database('lead_activities').insert({
        lead_id: id,
        activity_type: 'VISIT',
        content: `Lead converted to new member ${memberCode}`,
        created_by: converted_by || null
      });

      res.json({
        success: true,
        message: 'Lead converted to new member',
        data: {
          lead: updated,
          member: newMember,
          is_new_member: true
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
   * POST /gym/leads/:id/assign
   * Assign lead to sales person
   */
  router.post('/leads/:id/assign', async (req, res) => {
    try {
      const { id } = req.params;
      const { assigned_to, assigned_by } = req.body || {};

      const lead = await database('leads').where('id', id).first();
      if (!lead) {
        throw NotFoundError('Lead not found');
      }

      if (!assigned_to) {
        throw InvalidPayloadError('assigned_to is required');
      }

      // Verify employee exists
      const employee = await database('employees').where('id', assigned_to).first();
      if (!employee) {
        throw NotFoundError('Employee not found');
      }

      const previousAssignee = lead.assigned_to;

      const [updated] = await database('leads')
        .where('id', id)
        .update({
          assigned_to,
          updated_at: new Date()
        })
        .returning('*');

      // Add activity log
      await database('lead_activities').insert({
        lead_id: id,
        activity_type: 'CALL',
        content: `Lead assigned to ${employee.full_name}${previousAssignee ? ' (reassigned)' : ''}`,
        created_by: assigned_by || null
      });

      res.json({
        success: true,
        message: 'Lead assigned successfully',
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
   * GET /gym/leads/analytics
   * Lead analytics (conversion rates, source analysis)
   */
  router.get('/leads/analytics', async (req, res) => {
    try {
      const { branch_id, start_date, end_date } = req.query;

      const endDate = end_date || new Date().toISOString().split('T')[0];
      const startDate = start_date || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
      })();

      // Source breakdown
      let sourceQuery = database('leads')
        .select('source')
        .count('* as total')
        .sum(database.raw("CASE WHEN status = 'CONVERTED' THEN 1 ELSE 0 END as converted"))
        .whereBetween('created_at', [startDate, endDate])
        .groupBy('source');

      if (branch_id) {
        sourceQuery = sourceQuery.where('branch_id', branch_id);
      }

      const sourceBreakdown = await sourceQuery;

      // Status breakdown
      let statusQuery = database('leads')
        .select('status')
        .count('* as count')
        .whereBetween('created_at', [startDate, endDate])
        .groupBy('status');

      if (branch_id) {
        statusQuery = statusQuery.where('branch_id', branch_id);
      }

      const statusBreakdown = await statusQuery;

      // Average conversion time (days from creation to conversion)
      let avgTimeQuery = database('leads')
        .select(database.raw("AVG(EXTRACT(DAY FROM (converted_at - created_at))) as avg_days"))
        .where('status', 'CONVERTED')
        .whereNotNull('converted_at')
        .whereBetween('created_at', [startDate, endDate]);

      if (branch_id) {
        avgTimeQuery = avgTimeQuery.where('branch_id', branch_id);
      }

      const avgTimeResult = await avgTimeQuery.first();

      // Top performers (by conversion)
      let performersQuery = database('leads')
        .select('employees.id', 'employees.full_name')
        .count('leads.id as total_leads')
        .sum(database.raw("CASE WHEN leads.status = 'CONVERTED' THEN 1 ELSE 0 END as converted"))
        .leftJoin('employees', 'leads.assigned_to', 'employees.id')
        .whereNotNull('leads.assigned_to')
        .whereBetween('leads.created_at', [startDate, endDate])
        .groupBy('employees.id', 'employees.full_name')
        .orderBy('converted', 'desc')
        .limit(10);

      if (branch_id) {
        performersQuery = performersQuery.where('leads.branch_id', branch_id);
      }

      const topPerformers = await performersQuery;

      // Calculate conversion rates
      const sourceWithRates = sourceBreakdown.map(s => ({
        ...s,
        conversion_rate: s.total > 0 ? ((parseInt(s.converted) / parseInt(s.total)) * 100).toFixed(1) : 0
      }));

      const performersWithRates = topPerformers.map(p => ({
        ...p,
        conversion_rate: p.total_leads > 0 ? ((parseInt(p.converted) / parseInt(p.total_leads)) * 100).toFixed(1) : 0
      }));

      res.json({
        success: true,
        period: { start_date: startDate, end_date: endDate },
        data: {
          by_source: sourceWithRates,
          by_status: statusBreakdown,
          average_conversion_days: parseFloat(avgTimeResult?.avg_days || 0).toFixed(1),
          top_performers: performersWithRates
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

export default registerLeadsRoutes;
