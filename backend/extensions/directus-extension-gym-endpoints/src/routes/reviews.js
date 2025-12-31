/**
 * Class Reviews Routes
 * /gym/reviews/*
 */

import { InvalidPayloadError } from '../utils/errors.js';

/**
 * 註冊評價路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} memberAuthMiddleware - 會員認證中間件
 */
export function registerReviewsRoutes(router, context, memberAuthMiddleware) {
  const { database } = context;

  /**
   * GET /gym/reviews/eligibility/:bookingId
   */
  router.get('/reviews/eligibility/:bookingId', memberAuthMiddleware, async (req, res) => {
    try {
      const { bookingId } = req.params;
      const memberId = req.member.id;

      const result = await database.raw(`
        SELECT * FROM can_review_booking(?::uuid, ?::uuid)
      `, [bookingId, memberId]);

      const row = result.rows?.[0] || result[0];

      const existingReview = await database.raw(`
        SELECT id, rating, comment, reviewed_at
        FROM class_reviews WHERE booking_id = ? AND status = 'active'
      `, [bookingId]);

      const review = existingReview.rows?.[0] || existingReview[0];

      res.json({
        success: true,
        data: {
          can_review: row?.can_review || false,
          reason: row?.reason,
          days_since_session: row?.days_since_session,
          existing_review: review || null,
        },
      });
    } catch (error) {
      console.error('[GymEndpoint] Review eligibility error:', error);
      res.status(error.status || 500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * POST /gym/reviews
   */
  router.post('/reviews', memberAuthMiddleware, async (req, res) => {
    try {
      const { booking_id, rating, comment } = req.body || {};
      const memberId = req.member.id;

      if (!booking_id) throw InvalidPayloadError('booking_id is required');
      if (!rating || rating < 1 || rating > 5) throw InvalidPayloadError('rating must be between 1 and 5');

      const result = await database.raw(`
        SELECT * FROM submit_class_review(?::uuid, ?::uuid, ?::integer, ?::text)
      `, [booking_id, memberId, rating, comment || null]);

      const row = result.rows?.[0] || result[0];

      if (!row || !row.success) throw InvalidPayloadError(row?.message || '評價提交失敗');

      console.log(`[GymEndpoint] Review submitted: ${row.review_id} by member ${memberId}`);

      res.json({ success: true, message: row.message, review_id: row.review_id });
    } catch (error) {
      console.error('[GymEndpoint] Submit review error:', error);
      res.status(error.status || 500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * PUT /gym/reviews/:id
   */
  router.put('/reviews/:id', memberAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { rating, comment } = req.body || {};
      const memberId = req.member.id;

      if (!rating || rating < 1 || rating > 5) throw InvalidPayloadError('rating must be between 1 and 5');

      const result = await database.raw(`
        SELECT * FROM update_class_review(?::uuid, ?::uuid, ?::integer, ?::text)
      `, [id, memberId, rating, comment || null]);

      const row = result.rows?.[0] || result[0];

      if (!row || !row.success) throw InvalidPayloadError(row?.message || '更新評價失敗');

      res.json({ success: true, message: row.message });
    } catch (error) {
      console.error('[GymEndpoint] Update review error:', error);
      res.status(error.status || 500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * DELETE /gym/reviews/:id
   */
  router.delete('/reviews/:id', memberAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const memberId = req.member.id;

      const result = await database.raw(`
        SELECT * FROM delete_class_review(?::uuid, ?::uuid)
      `, [id, memberId]);

      const row = result.rows?.[0] || result[0];

      if (!row || !row.success) throw InvalidPayloadError(row?.message || '刪除評價失敗');

      res.json({ success: true, message: row.message });
    } catch (error) {
      console.error('[GymEndpoint] Delete review error:', error);
      res.status(error.status || 500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * GET /gym/reviews/class/:classId
   */
  router.get('/reviews/class/:classId', async (req, res) => {
    try {
      const { classId } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const reviews = await database.raw(`
        SELECT cr.id, cr.rating, cr.comment, cr.session_date, cr.reviewed_at,
          m.full_name as member_name, SUBSTRING(m.full_name, 1, 1) || '**' as member_display_name,
          e.full_name as instructor_name
        FROM class_reviews cr
        JOIN members m ON m.id = cr.member_id
        LEFT JOIN employees e ON e.id = cr.instructor_id
        WHERE cr.class_id = ? AND cr.status = 'active'
        ORDER BY cr.reviewed_at DESC
        LIMIT ? OFFSET ?
      `, [classId, parseInt(limit), parseInt(offset)]);

      const statsResult = await database.raw(`
        SELECT COUNT(*) as total_reviews, AVG(rating) as average_rating
        FROM class_reviews WHERE class_id = ? AND status = 'active'
      `, [classId]);

      const stats = statsResult.rows?.[0] || statsResult[0] || {};

      res.json({
        success: true,
        data: reviews.rows || reviews,
        stats: {
          total_reviews: parseInt(stats.total_reviews || 0),
          average_rating: parseFloat(stats.average_rating || 0).toFixed(1),
        },
      });
    } catch (error) {
      console.error('[GymEndpoint] Get class reviews error:', error);
      res.status(error.status || 500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * GET /gym/reviews/my
   */
  router.get('/reviews/my', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const { limit = 20, offset = 0 } = req.query;

      const reviews = await database.raw(`
        SELECT cr.id, cr.booking_id, cr.rating, cr.comment, cr.session_date, cr.reviewed_at,
          c.name as class_name, c.category as class_category, e.full_name as instructor_name
        FROM class_reviews cr
        JOIN classes c ON c.id = cr.class_id
        LEFT JOIN employees e ON e.id = cr.instructor_id
        WHERE cr.member_id = ? AND cr.status = 'active'
        ORDER BY cr.reviewed_at DESC
        LIMIT ? OFFSET ?
      `, [memberId, parseInt(limit), parseInt(offset)]);

      res.json({ success: true, data: reviews.rows || reviews });
    } catch (error) {
      console.error('[GymEndpoint] Get my reviews error:', error);
      res.status(error.status || 500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });
}

export default registerReviewsRoutes;
