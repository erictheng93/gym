/**
 * Workout Logs Routes
 * /gym/workouts/*
 */

import { InvalidPayloadError, NotFoundError } from '../utils/errors.js';

/**
 * Register workouts routes
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} memberAuthMiddleware - Member authentication middleware
 */
export function registerWorkoutsRoutes(router, context, memberAuthMiddleware) {
  const { database } = context;

  /**
   * GET /gym/workouts
   * List member's workout logs with pagination
   */
  router.get('/workouts', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { start_date, end_date, limit = 20, offset = 0 } = req.query;

      let query = database('workout_logs')
        .where('member_id', memberId)
        .orderBy('date', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      if (start_date) {
        query = query.where('date', '>=', start_date);
      }

      if (end_date) {
        query = query.where('date', '<=', end_date);
      }

      const workouts = await query.select('*');

      // Get total count
      const [{ count }] = await database('workout_logs')
        .where('member_id', memberId)
        .count('id as count');

      res.json({
        success: true,
        data: workouts,
        total: parseInt(count),
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/workouts/stats
   * Get workout statistics for a period
   */
  router.get('/workouts/stats', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { period = 'week' } = req.query; // week, month, year

      let startDate = new Date();
      switch (period) {
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      const workouts = await database('workout_logs')
        .where('member_id', memberId)
        .where('date', '>=', startDate.toISOString().split('T')[0])
        .select('*');

      const stats = {
        period,
        total_workouts: workouts.length,
        total_duration: workouts.reduce((sum, w) => sum + (w.duration || 0), 0),
        total_calories: workouts.reduce((sum, w) => sum + (w.calories || 0), 0),
        avg_duration: workouts.length > 0
          ? Math.round(workouts.reduce((sum, w) => sum + (w.duration || 0), 0) / workouts.length)
          : 0,
        avg_calories: workouts.length > 0
          ? Math.round(workouts.reduce((sum, w) => sum + (w.calories || 0), 0) / workouts.length)
          : 0,
        workout_days: new Set(workouts.map(w => w.date)).size,
      };

      // Group by day for chart data
      const dailyData = {};
      workouts.forEach(w => {
        const date = w.date;
        if (!dailyData[date]) {
          dailyData[date] = { date, duration: 0, calories: 0, count: 0 };
        }
        dailyData[date].duration += w.duration || 0;
        dailyData[date].calories += w.calories || 0;
        dailyData[date].count += 1;
      });

      res.json({
        success: true,
        data: {
          stats,
          daily: Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date)),
        },
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/workouts/:id
   * Get a single workout log
   */
  router.get('/workouts/:id', memberAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const memberId = req.member.id;

      const workout = await database('workout_logs')
        .where('id', id)
        .where('member_id', memberId)
        .first();

      if (!workout) {
        throw NotFoundError('Workout not found');
      }

      res.json({
        success: true,
        data: workout,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/workouts
   * Record a new workout
   */
  router.post('/workouts', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { date, duration, calories, exercises, notes } = req.body || {};

      // Validation
      if (!duration && !exercises) {
        throw InvalidPayloadError('Either duration or exercises is required');
      }

      const [workout] = await database('workout_logs')
        .insert({
          member_id: memberId,
          date: date || new Date().toISOString().split('T')[0],
          duration: duration || null,
          calories: calories || null,
          exercises: exercises ? (typeof exercises === 'string' ? JSON.parse(exercises) : exercises) : null,
          notes: notes || null,
        })
        .returning('*');

      res.status(201).json({
        success: true,
        message: 'Workout recorded successfully',
        data: workout,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * PUT /gym/workouts/:id
   * Update a workout log
   */
  router.put('/workouts/:id', memberAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const memberId = req.member.id;
      const { date, duration, calories, exercises, notes } = req.body || {};

      // Check ownership
      const existing = await database('workout_logs')
        .where('id', id)
        .where('member_id', memberId)
        .first();

      if (!existing) {
        throw NotFoundError('Workout not found');
      }

      const updateData = {};

      if (date !== undefined) updateData.date = date;
      if (duration !== undefined) updateData.duration = duration;
      if (calories !== undefined) updateData.calories = calories;
      if (exercises !== undefined) {
        updateData.exercises = typeof exercises === 'string' ? JSON.parse(exercises) : exercises;
      }
      if (notes !== undefined) updateData.notes = notes;

      const [updated] = await database('workout_logs')
        .where('id', id)
        .update(updateData)
        .returning('*');

      res.json({
        success: true,
        message: 'Workout updated successfully',
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
   * DELETE /gym/workouts/:id
   * Delete a workout log
   */
  router.delete('/workouts/:id', memberAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const memberId = req.member.id;

      const deleted = await database('workout_logs')
        .where('id', id)
        .where('member_id', memberId)
        .del();

      if (!deleted) {
        throw NotFoundError('Workout not found');
      }

      res.json({
        success: true,
        message: 'Workout deleted successfully',
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerWorkoutsRoutes;
