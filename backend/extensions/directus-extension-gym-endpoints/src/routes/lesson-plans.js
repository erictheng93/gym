/**
 * Lesson Plans Routes
 * /gym/lesson-plans/*
 *
 * 教案管理 API
 * - 教案 CRUD
 * - 教案範本管理
 */

import {
  InvalidPayloadError,
  NotFoundError,
  ForbiddenError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * 註冊教案路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} coachAuthMiddleware - 教練認證中間件
 */
export function registerLessonPlansRoutes(router, context, coachAuthMiddleware) {
  const { services, database, getSchema, env } = context;

  // ============================================
  // Lesson Plan CRUD
  // ============================================

  /**
   * GET /gym/lesson-plans
   * Get lesson plans (own plans and templates)
   */
  router.get('/lesson-plans', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { is_template, category, difficulty, search, limit = 20, offset = 0 } = req.query;

      let whereClause = 'WHERE (lp.coach_id = ? OR lp.is_template = TRUE)';
      const params = [coachId];

      if (is_template !== undefined) {
        whereClause += ' AND lp.is_template = ?';
        params.push(is_template === 'true');
      }

      if (category) {
        whereClause += ' AND lp.template_category = ?';
        params.push(category);
      }

      if (difficulty) {
        whereClause += ' AND lp.difficulty = ?';
        params.push(difficulty);
      }

      if (search) {
        whereClause += ' AND (lp.title ILIKE ? OR ? = ANY(lp.objectives))';
        const searchPattern = `%${search}%`;
        params.push(searchPattern, search);
      }

      const plansResult = await database.raw(`
        SELECT lp.*,
               e.full_name as coach_name,
               cs.scheduled_at as session_time,
               m.full_name as member_name
        FROM lesson_plans lp
        JOIN employees e ON lp.coach_id = e.id
        LEFT JOIN class_sessions cs ON lp.session_id = cs.id
        LEFT JOIN class_bookings cb ON cs.id = cb.id
        LEFT JOIN members m ON cb.member_id = m.id
        ${whereClause}
        ORDER BY lp.is_template DESC, lp.created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, parseInt(limit), parseInt(offset)]);

      const plans = plansResult.rows || plansResult;

      // Get total count
      const countResult = await database.raw(`
        SELECT COUNT(*) as total FROM lesson_plans lp ${whereClause}
      `, params);
      const total = parseInt(countResult.rows?.[0]?.total || countResult[0]?.total || 0);

      res.json({
        success: true,
        data: plans.map(p => ({
          id: p.id,
          title: p.title,
          objectives: p.objectives,
          warmup_exercises: p.warmup_exercises,
          main_exercises: p.main_exercises,
          cooldown_exercises: p.cooldown_exercises,
          notes: p.notes,
          is_template: p.is_template,
          template_category: p.template_category,
          difficulty: p.difficulty,
          duration_minutes: p.duration_minutes,
          coach_id: p.coach_id,
          coach_name: p.coach_name,
          session_id: p.session_id,
          session_time: p.session_time,
          member_name: p.member_name,
          created_at: p.created_at,
          updated_at: p.updated_at,
        })),
        meta: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
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
   * GET /gym/lesson-plans/templates
   * Get template lesson plans
   */
  router.get('/lesson-plans/templates', coachAuthMiddleware, async (req, res) => {
    try {
      const { category, difficulty, limit = 50, offset = 0 } = req.query;

      let whereClause = 'WHERE lp.is_template = TRUE';
      const params = [];

      if (category) {
        whereClause += ' AND lp.template_category = ?';
        params.push(category);
      }

      if (difficulty) {
        whereClause += ' AND lp.difficulty = ?';
        params.push(difficulty);
      }

      const templatesResult = await database.raw(`
        SELECT lp.*, e.full_name as coach_name
        FROM lesson_plans lp
        JOIN employees e ON lp.coach_id = e.id
        ${whereClause}
        ORDER BY lp.template_category, lp.title
        LIMIT ? OFFSET ?
      `, [...params, parseInt(limit), parseInt(offset)]);

      const templates = templatesResult.rows || templatesResult;

      // Get categories
      const categoriesResult = await database.raw(`
        SELECT DISTINCT template_category FROM lesson_plans
        WHERE is_template = TRUE AND template_category IS NOT NULL
        ORDER BY template_category
      `);
      const categories = (categoriesResult.rows || categoriesResult).map(c => c.template_category);

      res.json({
        success: true,
        data: templates.map(t => ({
          id: t.id,
          title: t.title,
          objectives: t.objectives,
          warmup_exercises: t.warmup_exercises,
          main_exercises: t.main_exercises,
          cooldown_exercises: t.cooldown_exercises,
          notes: t.notes,
          template_category: t.template_category,
          difficulty: t.difficulty,
          duration_minutes: t.duration_minutes,
          coach_name: t.coach_name,
          created_at: t.created_at,
        })),
        categories,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/lesson-plans/:id
   * Get lesson plan details
   */
  router.get('/lesson-plans/:id', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id } = req.params;

      const planResult = await database.raw(`
        SELECT lp.*,
               e.full_name as coach_name,
               cs.scheduled_at as session_time,
               m.id as member_id, m.full_name as member_name
        FROM lesson_plans lp
        JOIN employees e ON lp.coach_id = e.id
        LEFT JOIN class_sessions cs ON lp.session_id = cs.id
        LEFT JOIN class_bookings cb ON cs.id = cb.id
        LEFT JOIN members m ON cb.member_id = m.id
        WHERE lp.id = ?
          AND (lp.coach_id = ? OR lp.is_template = TRUE)
      `, [id, coachId]);

      const plan = planResult.rows?.[0] || planResult[0];

      if (!plan) {
        throw NotFoundError('教案不存在或無權限查看');
      }

      res.json({
        success: true,
        data: {
          id: plan.id,
          title: plan.title,
          objectives: plan.objectives,
          warmup_exercises: plan.warmup_exercises,
          main_exercises: plan.main_exercises,
          cooldown_exercises: plan.cooldown_exercises,
          notes: plan.notes,
          is_template: plan.is_template,
          template_category: plan.template_category,
          difficulty: plan.difficulty,
          duration_minutes: plan.duration_minutes,
          coach_id: plan.coach_id,
          coach_name: plan.coach_name,
          session_id: plan.session_id,
          session_time: plan.session_time,
          member_id: plan.member_id,
          member_name: plan.member_name,
          created_at: plan.created_at,
          updated_at: plan.updated_at,
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
   * POST /gym/lesson-plans
   * Create a new lesson plan
   */
  router.post('/lesson-plans', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const {
        title,
        objectives,
        warmup_exercises,
        main_exercises,
        cooldown_exercises,
        notes,
        is_template = false,
        template_category,
        difficulty,
        duration_minutes = 60,
        session_id,
      } = req.body || {};

      if (!title) {
        throw InvalidPayloadError('請輸入教案標題');
      }

      // Validate session_id if provided
      if (session_id) {
        const sessionResult = await database.raw(`
          SELECT id FROM class_sessions WHERE id = ?
        `, [session_id]);

        if (!(sessionResult.rows?.[0] || sessionResult[0])) {
          throw NotFoundError('指定的課程不存在');
        }
      }

      const insertResult = await database.raw(`
        INSERT INTO lesson_plans (
          coach_id, title, objectives, warmup_exercises, main_exercises,
          cooldown_exercises, notes, is_template, template_category,
          difficulty, duration_minutes, session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `, [
        coachId,
        title,
        objectives || [],
        JSON.stringify(warmup_exercises || []),
        JSON.stringify(main_exercises || []),
        JSON.stringify(cooldown_exercises || []),
        notes || null,
        is_template,
        is_template ? template_category : null,
        difficulty || null,
        duration_minutes,
        session_id || null,
      ]);

      const plan = insertResult.rows?.[0] || insertResult[0];

      logger.info('Lesson plan created', { coachId, planId: plan.id, isTemplate: is_template });

      res.status(201).json({
        success: true,
        message: is_template ? '教案範本已建立' : '教案已建立',
        data: {
          id: plan.id,
          title: plan.title,
          is_template: plan.is_template,
          created_at: plan.created_at,
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
   * PUT /gym/lesson-plans/:id
   * Update a lesson plan
   */
  router.put('/lesson-plans/:id', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id } = req.params;
      const {
        title,
        objectives,
        warmup_exercises,
        main_exercises,
        cooldown_exercises,
        notes,
        is_template,
        template_category,
        difficulty,
        duration_minutes,
        session_id,
      } = req.body || {};

      // Verify ownership
      const planResult = await database.raw(`
        SELECT * FROM lesson_plans WHERE id = ? AND coach_id = ?
      `, [id, coachId]);

      const plan = planResult.rows?.[0] || planResult[0];

      if (!plan) {
        throw NotFoundError('教案不存在或無權限修改');
      }

      // Build update query
      const updates = [];
      const params = [];

      if (title !== undefined) {
        updates.push('title = ?');
        params.push(title);
      }

      if (objectives !== undefined) {
        updates.push('objectives = ?');
        params.push(objectives);
      }

      if (warmup_exercises !== undefined) {
        updates.push('warmup_exercises = ?');
        params.push(JSON.stringify(warmup_exercises));
      }

      if (main_exercises !== undefined) {
        updates.push('main_exercises = ?');
        params.push(JSON.stringify(main_exercises));
      }

      if (cooldown_exercises !== undefined) {
        updates.push('cooldown_exercises = ?');
        params.push(JSON.stringify(cooldown_exercises));
      }

      if (notes !== undefined) {
        updates.push('notes = ?');
        params.push(notes);
      }

      if (is_template !== undefined) {
        updates.push('is_template = ?');
        params.push(is_template);
      }

      if (template_category !== undefined) {
        updates.push('template_category = ?');
        params.push(template_category);
      }

      if (difficulty !== undefined) {
        updates.push('difficulty = ?');
        params.push(difficulty);
      }

      if (duration_minutes !== undefined) {
        updates.push('duration_minutes = ?');
        params.push(duration_minutes);
      }

      if (session_id !== undefined) {
        updates.push('session_id = ?');
        params.push(session_id);
      }

      if (updates.length === 0) {
        throw InvalidPayloadError('請提供要更新的欄位');
      }

      updates.push('updated_at = NOW()');
      params.push(id);

      const updateResult = await database.raw(`
        UPDATE lesson_plans
        SET ${updates.join(', ')}
        WHERE id = ?
        RETURNING *
      `, params);

      const updatedPlan = updateResult.rows?.[0] || updateResult[0];

      res.json({
        success: true,
        message: '教案已更新',
        data: {
          id: updatedPlan.id,
          title: updatedPlan.title,
          is_template: updatedPlan.is_template,
          updated_at: updatedPlan.updated_at,
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
   * DELETE /gym/lesson-plans/:id
   * Delete a lesson plan
   */
  router.delete('/lesson-plans/:id', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id } = req.params;

      const deleteResult = await database.raw(`
        DELETE FROM lesson_plans
        WHERE id = ? AND coach_id = ?
        RETURNING id
      `, [id, coachId]);

      if (!(deleteResult.rows?.[0] || deleteResult[0])) {
        throw NotFoundError('教案不存在或無權限刪除');
      }

      logger.info('Lesson plan deleted', { coachId, planId: id });

      res.json({
        success: true,
        message: '教案已刪除',
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/lesson-plans/:id/copy
   * Copy a template to create a new lesson plan
   */
  router.post('/lesson-plans/:id/copy', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id } = req.params;
      const { title, session_id } = req.body || {};

      // Get the source plan (must be a template or own plan)
      const sourceResult = await database.raw(`
        SELECT * FROM lesson_plans
        WHERE id = ? AND (is_template = TRUE OR coach_id = ?)
      `, [id, coachId]);

      const source = sourceResult.rows?.[0] || sourceResult[0];

      if (!source) {
        throw NotFoundError('教案範本不存在或無權限複製');
      }

      // Create new plan from template
      const insertResult = await database.raw(`
        INSERT INTO lesson_plans (
          coach_id, title, objectives, warmup_exercises, main_exercises,
          cooldown_exercises, notes, is_template, difficulty, duration_minutes, session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, ?, ?, ?)
        RETURNING *
      `, [
        coachId,
        title || `${source.title} (複製)`,
        source.objectives,
        source.warmup_exercises,
        source.main_exercises,
        source.cooldown_exercises,
        source.notes,
        source.difficulty,
        source.duration_minutes,
        session_id || null,
      ]);

      const newPlan = insertResult.rows?.[0] || insertResult[0];

      logger.info('Lesson plan copied', { coachId, sourceId: id, newPlanId: newPlan.id });

      res.status(201).json({
        success: true,
        message: '教案已複製',
        data: {
          id: newPlan.id,
          title: newPlan.title,
          created_at: newPlan.created_at,
        },
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerLessonPlansRoutes;
