/**
 * Bookings Routes
 * /gym/bookings/*
 */

import {
  InvalidPayloadError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors.js';

/**
 * 註冊預約路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} memberAuthMiddleware - 會員認證中間件
 */
export function registerBookingsRoutes(router, context, memberAuthMiddleware) {
  const { services, database, getSchema } = context;
  const { ItemsService } = services;

  /**
   * POST /gym/bookings
   * Book a class session
   */
  router.post('/bookings', memberAuthMiddleware, async (req, res) => {
    try {
      const { session_id, contract_id } = req.body || {};
      const memberId = req.member.id;

      if (!session_id) {
        throw InvalidPayloadError('session_id is required');
      }

      const result = await database.raw(`
        SELECT * FROM book_class_session(?::uuid, ?::uuid, ?::uuid)
      `, [session_id, memberId, contract_id || null]);

      const row = result.rows?.[0] || result[0];

      if (!row || !row.success) {
        throw InvalidPayloadError(row?.message || 'Booking failed');
      }

      console.log(`[GymEndpoint] Booking created: ${row.booking_id} for member ${memberId}`);

      res.json({
        success: true,
        message: row.message,
        booking_id: row.booking_id,
        booking_status: row.booking_status,
        waitlist_position: row.waitlist_position,
      });
    } catch (error) {
      console.error('[GymEndpoint] Booking error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * DELETE /gym/bookings/:id
   * Cancel a booking
   */
  router.delete('/bookings/:id', memberAuthMiddleware, async (req, res) => {
    try {
      const bookingId = req.params.id;
      const { reason } = req.body || {};

      const schema = await getSchema();
      const bookingsService = new ItemsService('bookings', {
        schema,
        knex: database,
      });

      const booking = await bookingsService.readOne(bookingId, {
        fields: ['id', 'member_id', 'booking_status'],
      });

      if (!booking) {
        throw NotFoundError('Booking not found');
      }

      if (booking.member_id !== req.member.id) {
        throw ForbiddenError('Cannot cancel other member\'s booking');
      }

      const result = await database.raw(`
        SELECT * FROM cancel_booking(?::uuid, ?::text)
      `, [bookingId, reason || null]);

      const row = result.rows?.[0] || result[0];

      if (!row || !row.success) {
        throw InvalidPayloadError(row?.message || 'Cancel failed');
      }

      console.log(`[GymEndpoint] Booking cancelled: ${bookingId}`);

      res.json({
        success: true,
        message: row.message,
        promoted_booking_id: row.promoted_booking_id,
      });
    } catch (error) {
      console.error('[GymEndpoint] Cancel booking error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/bookings
   * Get member's bookings (authenticated)
   */
  router.get('/bookings', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { status } = req.query;

      const schema = await getSchema();
      const bookingsService = new ItemsService('bookings', {
        schema,
        knex: database,
      });

      const filter = {
        _and: [
          { member_id: { _eq: memberId } },
          { status: { _eq: 'active' } },
        ],
      };

      if (status) {
        filter._and.push({ booking_status: { _eq: status } });
      }

      const bookings = await bookingsService.readByQuery({
        filter,
        fields: [
          'id', 'booking_status', 'waitlist_position', 'booked_at', 'cancelled_at', 'attended_at',
          'session_id.id', 'session_id.session_date', 'session_id.current_count', 'session_id.waitlist_count',
          'session_id.session_status',
          'session_id.schedule_id.start_time', 'session_id.schedule_id.end_time', 'session_id.schedule_id.room',
          'session_id.schedule_id.class_id.id', 'session_id.schedule_id.class_id.name',
          'session_id.schedule_id.class_id.category',
          'session_id.schedule_id.instructor_id.full_name',
          'session_id.schedule_id.branch_id.name',
          'contract_id.id', 'contract_id.contract_no', 'contract_id.remaining_counts',
        ],
        sort: ['-session_id.session_date', '-session_id.schedule_id.start_time'],
        limit: 50,
      });

      const transformed = bookings.map(b => ({
        id: b.id,
        booking_status: b.booking_status,
        waitlist_position: b.waitlist_position,
        booked_at: b.booked_at,
        cancelled_at: b.cancelled_at,
        attended_at: b.attended_at,
        session_id: b.session_id?.id,
        session: b.session_id ? {
          id: b.session_id.id,
          session_date: b.session_id.session_date,
          current_count: b.session_id.current_count,
          waitlist_count: b.session_id.waitlist_count,
          session_status: b.session_id.session_status,
          schedule: b.session_id.schedule_id ? {
            start_time: b.session_id.schedule_id.start_time,
            end_time: b.session_id.schedule_id.end_time,
            room: b.session_id.schedule_id.room,
            class: b.session_id.schedule_id.class_id,
            instructor: b.session_id.schedule_id.instructor_id,
            branch: b.session_id.schedule_id.branch_id,
          } : null,
        } : null,
        session_date: b.session_id?.session_date,
        start_time: b.session_id?.schedule_id?.start_time,
        end_time: b.session_id?.schedule_id?.end_time,
        class_name: b.session_id?.schedule_id?.class_id?.name,
        instructor_name: b.session_id?.schedule_id?.instructor_id?.full_name,
        room: b.session_id?.schedule_id?.room,
        contract: b.contract_id,
      }));

      res.json({
        success: true,
        data: transformed,
      });
    } catch (error) {
      console.error('[GymEndpoint] Get bookings error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/bookings/my
   * Get member's bookings (alias for backwards compatibility)
   */
  router.get('/bookings/my', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { status, upcoming_only } = req.query;

      const schema = await getSchema();
      const bookingsService = new ItemsService('bookings', {
        schema,
        knex: database,
      });

      const filter = {
        _and: [
          { member_id: { _eq: memberId } },
          { status: { _eq: 'active' } },
        ],
      };

      if (status) {
        filter._and.push({ booking_status: { _eq: status } });
      } else {
        filter._and.push({ booking_status: { _in: ['CONFIRMED', 'WAITLIST', 'ATTENDED'] } });
      }

      const bookings = await bookingsService.readByQuery({
        filter,
        fields: [
          'id', 'booking_status', 'waitlist_position', 'booked_at', 'attended_at',
          'session_id.id', 'session_id.session_date', 'session_id.start_time', 'session_id.end_time',
          'session_id.room', 'session_id.session_status',
          'session_id.class_id.id', 'session_id.class_id.name', 'session_id.class_id.category',
          'session_id.instructor_id.full_name',
          'session_id.branch_id.name',
        ],
        sort: ['-session_id.session_date', '-session_id.start_time'],
        limit: 50,
      });

      let result = bookings;
      if (upcoming_only === 'true') {
        const today = new Date().toISOString().split('T')[0];
        result = bookings.filter(b => b.session_id?.session_date >= today);
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[GymEndpoint] Get my bookings error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/bookings/:id/attend
   * Mark booking as attended (admin only)
   */
  router.post('/bookings/:id/attend', async (req, res) => {
    try {
      const bookingId = req.params.id;

      const result = await database.raw(`
        SELECT * FROM attend_class(?::uuid)
      `, [bookingId]);

      const row = result.rows?.[0] || result[0];

      if (!row || !row.success) {
        throw InvalidPayloadError(row?.message || 'Attendance failed');
      }

      console.log(`[GymEndpoint] Booking attended: ${bookingId}`);

      res.json({
        success: true,
        message: row.message,
        remaining_counts: row.remaining_counts,
      });
    } catch (error) {
      console.error('[GymEndpoint] Attend booking error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerBookingsRoutes;
