/**
 * Member Goals Routes
 * /gym/goals/*
 */

import { InvalidPayloadError, NotFoundError } from '../utils/errors.js';

/**
 * Register goals routes
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} memberAuthMiddleware - Member authentication middleware
 */
export function registerGoalsRoutes(router, context, memberAuthMiddleware) {
  const { database } = context;

  /**
   * GET /gym/goals
   * List member's goals with optional status filter
   */
  router.get('/goals', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { status, limit = 20, offset = 0 } = req.query;

      let query = database('member_goals')
        .where('member_id', memberId)
        .orderBy('created_at', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      if (status) {
        query = query.where('status', status.toUpperCase());
      }

      const goals = await query.select('*');

      res.json({
        success: true,
        data: goals,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/goals/:id
   * Get a single goal
   */
  router.get('/goals/:id', memberAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const memberId = req.member.id;

      const goal = await database('member_goals')
        .where('id', id)
        .where('member_id', memberId)
        .first();

      if (!goal) {
        throw NotFoundError('Goal not found');
      }

      res.json({
        success: true,
        data: goal,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/goals
   * Create a new goal
   */
  router.post('/goals', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { goal_type, target_value, current_value, start_date, target_date, notes } = req.body || {};

      // Validation
      const validGoalTypes = ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'BODY_SHAPE', 'HEALTH', 'OTHER'];
      if (!goal_type || !validGoalTypes.includes(goal_type.toUpperCase())) {
        throw InvalidPayloadError(`goal_type must be one of: ${validGoalTypes.join(', ')}`);
      }

      if (!target_value) {
        throw InvalidPayloadError('target_value is required');
      }

      const [goal] = await database('member_goals')
        .insert({
          member_id: memberId,
          goal_type: goal_type.toUpperCase(),
          target_value: typeof target_value === 'string' ? JSON.parse(target_value) : target_value,
          current_value: current_value ? (typeof current_value === 'string' ? JSON.parse(current_value) : current_value) : null,
          start_date: start_date || new Date().toISOString().split('T')[0],
          target_date: target_date || null,
          notes: notes || null,
          status: 'IN_PROGRESS',
        })
        .returning('*');

      res.status(201).json({
        success: true,
        message: 'Goal created successfully',
        data: goal,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * PUT /gym/goals/:id
   * Update goal progress or status
   */
  router.put('/goals/:id', memberAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const memberId = req.member.id;
      const { current_value, target_value, target_date, status, notes } = req.body || {};

      // Check ownership
      const existing = await database('member_goals')
        .where('id', id)
        .where('member_id', memberId)
        .first();

      if (!existing) {
        throw NotFoundError('Goal not found');
      }

      const updateData = {
        updated_at: new Date(),
      };

      if (current_value !== undefined) {
        updateData.current_value = typeof current_value === 'string' ? JSON.parse(current_value) : current_value;
      }

      if (target_value !== undefined) {
        updateData.target_value = typeof target_value === 'string' ? JSON.parse(target_value) : target_value;
      }

      if (target_date !== undefined) {
        updateData.target_date = target_date;
      }

      if (status) {
        const validStatuses = ['IN_PROGRESS', 'ACHIEVED', 'ABANDONED'];
        if (!validStatuses.includes(status.toUpperCase())) {
          throw InvalidPayloadError(`status must be one of: ${validStatuses.join(', ')}`);
        }
        updateData.status = status.toUpperCase();
      }

      if (notes !== undefined) {
        updateData.notes = notes;
      }

      const [updated] = await database('member_goals')
        .where('id', id)
        .update(updateData)
        .returning('*');

      res.json({
        success: true,
        message: 'Goal updated successfully',
        data: updated,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * DELETE /gym/goals/:id
   * Delete a goal
   */
  router.delete('/goals/:id', memberAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const memberId = req.member.id;

      const deleted = await database('member_goals')
        .where('id', id)
        .where('member_id', memberId)
        .del();

      if (!deleted) {
        throw NotFoundError('Goal not found');
      }

      res.json({
        success: true,
        message: 'Goal deleted successfully',
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerGoalsRoutes;
