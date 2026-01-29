/**
 * Body Measurements Routes
 * /gym/measurements/*
 */

import { InvalidPayloadError, NotFoundError } from '../utils/errors.js';

/**
 * Register measurements routes
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} memberAuthMiddleware - Member authentication middleware
 */
export function registerMeasurementsRoutes(router, context, memberAuthMiddleware) {
  const { database } = context;

  /**
   * GET /gym/measurements
   * List member's body measurements with optional date filter
   */
  router.get('/measurements', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { start_date, end_date, limit = 50, offset = 0 } = req.query;

      let query = database('body_measurements')
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

      const measurements = await query.select('*');

      res.json({
        success: true,
        data: measurements,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/measurements/latest
   * Get the latest measurement record
   */
  router.get('/measurements/latest', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;

      const measurement = await database('body_measurements')
        .where('member_id', memberId)
        .orderBy('date', 'desc')
        .first();

      res.json({
        success: true,
        data: measurement || null,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/measurements/stats
   * Get measurement statistics (trends)
   */
  router.get('/measurements/stats', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { period = '30' } = req.query; // days

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(period));

      const measurements = await database('body_measurements')
        .where('member_id', memberId)
        .where('date', '>=', startDate.toISOString().split('T')[0])
        .orderBy('date', 'asc')
        .select('*');

      // Calculate trends
      let stats = {
        total_records: measurements.length,
        period_days: parseInt(period),
        weight: { first: null, last: null, change: null, trend: null },
        body_fat: { first: null, last: null, change: null, trend: null },
        muscle_mass: { first: null, last: null, change: null, trend: null },
        bmi: { first: null, last: null, change: null, trend: null },
      };

      if (measurements.length >= 2) {
        const first = measurements[0];
        const last = measurements[measurements.length - 1];

        const calculateTrend = (firstVal, lastVal) => {
          if (firstVal == null || lastVal == null) return null;
          const change = lastVal - firstVal;
          return {
            first: firstVal,
            last: lastVal,
            change: parseFloat(change.toFixed(2)),
            trend: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
          };
        };

        stats.weight = calculateTrend(first.weight, last.weight) || stats.weight;
        stats.body_fat = calculateTrend(first.body_fat, last.body_fat) || stats.body_fat;
        stats.muscle_mass = calculateTrend(first.muscle_mass, last.muscle_mass) || stats.muscle_mass;
        stats.bmi = calculateTrend(first.bmi, last.bmi) || stats.bmi;
      } else if (measurements.length === 1) {
        const m = measurements[0];
        stats.weight = { first: m.weight, last: m.weight, change: 0, trend: 'stable' };
        stats.body_fat = { first: m.body_fat, last: m.body_fat, change: 0, trend: 'stable' };
        stats.muscle_mass = { first: m.muscle_mass, last: m.muscle_mass, change: 0, trend: 'stable' };
        stats.bmi = { first: m.bmi, last: m.bmi, change: 0, trend: 'stable' };
      }

      res.json({
        success: true,
        data: stats,
        measurements: measurements,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/measurements
   * Add a new body measurement record
   */
  router.post('/measurements', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { date, weight, body_fat, muscle_mass, bmi, source = 'MANUAL', raw_data } = req.body || {};

      // Validation
      if (!weight && !body_fat && !muscle_mass && !bmi) {
        throw InvalidPayloadError('At least one measurement value is required');
      }

      const validSources = ['MANUAL', 'INBODY', 'APPLE_HEALTH'];
      if (!validSources.includes(source.toUpperCase())) {
        throw InvalidPayloadError(`source must be one of: ${validSources.join(', ')}`);
      }

      // Calculate BMI if weight provided and member has height
      let calculatedBmi = bmi;
      if (weight && !bmi) {
        const member = await database('members')
          .where('id', memberId)
          .select('height')
          .first();

        if (member?.height) {
          const heightInMeters = member.height / 100;
          calculatedBmi = parseFloat((weight / (heightInMeters * heightInMeters)).toFixed(1));
        }
      }

      const [measurement] = await database('body_measurements')
        .insert({
          member_id: memberId,
          date: date || new Date().toISOString().split('T')[0],
          weight: weight || null,
          body_fat: body_fat || null,
          muscle_mass: muscle_mass || null,
          bmi: calculatedBmi || null,
          source: source.toUpperCase(),
          raw_data: raw_data ? (typeof raw_data === 'string' ? JSON.parse(raw_data) : raw_data) : null,
        })
        .returning('*');

      res.status(201).json({
        success: true,
        message: 'Measurement recorded successfully',
        data: measurement,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * DELETE /gym/measurements/:id
   * Delete a measurement record
   */
  router.delete('/measurements/:id', memberAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const memberId = req.member.id;

      const deleted = await database('body_measurements')
        .where('id', id)
        .where('member_id', memberId)
        .del();

      if (!deleted) {
        throw NotFoundError('Measurement not found');
      }

      res.json({
        success: true,
        message: 'Measurement deleted successfully',
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerMeasurementsRoutes;
