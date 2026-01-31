/**
 * Member-Coaches Routes
 * /gym/coach/students/*
 *
 * 教練學員管理 API
 * - 查看指派學員
 * - 學員詳情、目標、進度
 * - 學員筆記管理
 */

import {
  InvalidPayloadError,
  NotFoundError,
  ForbiddenError,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * 註冊學員管理路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} coachAuthMiddleware - 教練認證中間件
 */
export function registerMemberCoachesRoutes(router, context, coachAuthMiddleware) {
  const { services, database, getSchema, env } = context;

  // ============================================
  // Student List Routes
  // ============================================

  /**
   * GET /gym/coach/students
   * Get list of assigned students
   */
  router.get('/coach/students', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { role, search, status, limit = 50, offset = 0 } = req.query;

      let whereClause = 'WHERE mc.coach_id = ? AND mc.is_active = TRUE';
      const params = [coachId];

      if (role) {
        whereClause += ' AND mc.role = ?';
        params.push(role);
      }

      if (status) {
        whereClause += ' AND m.status = ?';
        params.push(status);
      }

      if (search) {
        whereClause += ' AND (m.full_name ILIKE ? OR m.phone ILIKE ? OR m.member_code ILIKE ?)';
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      const studentsResult = await database.raw(`
        SELECT
          m.id, m.member_code, m.full_name, m.phone, m.email, m.status,
          m.avatar, m.gender, m.birthday,
          mc.role as coach_role, mc.assigned_at,
          b.name as branch_name,
          (
            SELECT COUNT(*) FROM class_bookings cb
            WHERE cb.member_id = m.id AND cb.coach_id = ?
              AND cb.status = 'COMPLETED'
          ) as completed_classes,
          (
            SELECT COUNT(*) FROM contracts c
            WHERE c.member_id = m.id AND c.status = 'ACTIVE'
          ) as active_contracts,
          (
            SELECT mg.goal_type FROM member_goals mg
            WHERE mg.member_id = m.id AND mg.status = 'IN_PROGRESS'
            ORDER BY mg.created_at DESC LIMIT 1
          ) as current_goal
        FROM member_coaches mc
        JOIN members m ON mc.member_id = m.id
        JOIN branches b ON m.branch_id = b.id
        ${whereClause}
        ORDER BY mc.role ASC, m.full_name ASC
        LIMIT ? OFFSET ?
      `, [coachId, ...params, parseInt(limit), parseInt(offset)]);

      const students = studentsResult.rows || studentsResult;

      // Get total count
      const countResult = await database.raw(`
        SELECT COUNT(*) as total
        FROM member_coaches mc
        JOIN members m ON mc.member_id = m.id
        ${whereClause}
      `, params);
      const total = parseInt(countResult.rows?.[0]?.total || countResult[0]?.total || 0);

      res.json({
        success: true,
        data: students.map(s => ({
          id: s.id,
          member_code: s.member_code,
          full_name: s.full_name,
          phone: s.phone,
          email: s.email,
          status: s.status,
          avatar: s.avatar,
          gender: s.gender,
          birthday: s.birthday,
          coach_role: s.coach_role,
          assigned_at: s.assigned_at,
          branch_name: s.branch_name,
          completed_classes: parseInt(s.completed_classes) || 0,
          active_contracts: parseInt(s.active_contracts) || 0,
          current_goal: s.current_goal,
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
   * GET /gym/coach/students/:id
   * Get student details with contracts, goals, and progress
   */
  router.get('/coach/students/:id', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id } = req.params;

      // Verify this is an assigned student
      const assignmentResult = await database.raw(`
        SELECT mc.role, mc.assigned_at
        FROM member_coaches mc
        WHERE mc.coach_id = ? AND mc.member_id = ? AND mc.is_active = TRUE
      `, [coachId, id]);

      const assignment = assignmentResult.rows?.[0] || assignmentResult[0];

      if (!assignment) {
        throw ForbiddenError('此學員未指派給您');
      }

      // Get member details
      const memberResult = await database.raw(`
        SELECT m.*, b.name as branch_name
        FROM members m
        JOIN branches b ON m.branch_id = b.id
        WHERE m.id = ?
      `, [id]);

      const member = memberResult.rows?.[0] || memberResult[0];

      if (!member) {
        throw NotFoundError('學員不存在');
      }

      // Get active contracts
      const contractsResult = await database.raw(`
        SELECT c.id, c.contract_no, c.status, c.start_date, c.end_date,
               c.remaining_counts, c.total_amount, c.paid_amount,
               mp.name as plan_name, mp.type as plan_type
        FROM contracts c
        JOIN membership_plans mp ON c.plan_id = mp.id
        WHERE c.member_id = ? AND c.status IN ('ACTIVE', 'PAUSED')
        ORDER BY c.status ASC, c.end_date ASC
      `, [id]);
      const contracts = contractsResult.rows || contractsResult;

      // Get goals
      const goalsResult = await database.raw(`
        SELECT * FROM member_goals
        WHERE member_id = ?
        ORDER BY status ASC, created_at DESC
        LIMIT 5
      `, [id]);
      const goals = goalsResult.rows || goalsResult;

      // Get recent body measurements
      const measurementsResult = await database.raw(`
        SELECT * FROM body_measurements
        WHERE member_id = ?
        ORDER BY date DESC
        LIMIT 10
      `, [id]);
      const measurements = measurementsResult.rows || measurementsResult;

      // Get class history with this coach
      const classHistoryResult = await database.raw(`
        SELECT cb.id, cb.scheduled_at, cb.status, cb.duration_minutes,
               cr.main_content, cr.coach_notes, cr.next_plan
        FROM class_bookings cb
        LEFT JOIN class_records cr ON cr.booking_id = cb.id
        WHERE cb.member_id = ? AND cb.coach_id = ?
        ORDER BY cb.scheduled_at DESC
        LIMIT 20
      `, [id, coachId]);
      const classHistory = classHistoryResult.rows || classHistoryResult;

      // Get notes from this coach
      const notesResult = await database.raw(`
        SELECT * FROM student_notes
        WHERE coach_id = ? AND member_id = ?
        ORDER BY created_at DESC
        LIMIT 10
      `, [coachId, id]);
      const notes = notesResult.rows || notesResult;

      res.json({
        success: true,
        data: {
          id: member.id,
          member_code: member.member_code,
          full_name: member.full_name,
          phone: member.phone,
          email: member.email,
          gender: member.gender,
          birthday: member.birthday,
          status: member.status,
          avatar: member.avatar,
          height: member.height,
          branch_name: member.branch_name,
          join_date: member.join_date,
          coach_role: assignment.role,
          assigned_at: assignment.assigned_at,
          contracts: contracts.map(c => ({
            id: c.id,
            contract_no: c.contract_no,
            status: c.status,
            start_date: c.start_date,
            end_date: c.end_date,
            remaining_counts: c.remaining_counts,
            plan_name: c.plan_name,
            plan_type: c.plan_type,
          })),
          goals: goals.map(g => ({
            id: g.id,
            goal_type: g.goal_type,
            target_value: g.target_value,
            current_value: g.current_value,
            start_date: g.start_date,
            target_date: g.target_date,
            status: g.status,
          })),
          measurements: measurements.map(m => ({
            id: m.id,
            date: m.date,
            weight: m.weight,
            body_fat: m.body_fat,
            muscle_mass: m.muscle_mass,
            bmi: m.bmi,
            source: m.source,
          })),
          class_history: classHistory.map(c => ({
            id: c.id,
            scheduled_at: c.scheduled_at,
            status: c.status,
            duration_minutes: c.duration_minutes,
            main_content: c.main_content,
            coach_notes: c.coach_notes,
            next_plan: c.next_plan,
          })),
          notes: notes.map(n => ({
            id: n.id,
            note_type: n.note_type,
            content: n.content,
            is_private: n.is_private,
            created_at: n.created_at,
          })),
        },
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  // ============================================
  // Student Notes Routes
  // ============================================

  /**
   * GET /gym/coach/students/:id/notes
   * Get notes for a student
   */
  router.get('/coach/students/:id/notes', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id } = req.params;
      const { note_type, limit = 20, offset = 0 } = req.query;

      // Verify assignment
      const assignmentResult = await database.raw(`
        SELECT 1 FROM member_coaches
        WHERE coach_id = ? AND member_id = ? AND is_active = TRUE
      `, [coachId, id]);

      if (!(assignmentResult.rows?.[0] || assignmentResult[0])) {
        throw ForbiddenError('此學員未指派給您');
      }

      let whereClause = 'WHERE coach_id = ? AND member_id = ?';
      const params = [coachId, id];

      if (note_type) {
        whereClause += ' AND note_type = ?';
        params.push(note_type);
      }

      const notesResult = await database.raw(`
        SELECT * FROM student_notes
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, parseInt(limit), parseInt(offset)]);

      const notes = notesResult.rows || notesResult;

      // Get total count
      const countResult = await database.raw(`
        SELECT COUNT(*) as total FROM student_notes ${whereClause}
      `, params);
      const total = parseInt(countResult.rows?.[0]?.total || countResult[0]?.total || 0);

      res.json({
        success: true,
        data: notes.map(n => ({
          id: n.id,
          note_type: n.note_type,
          content: n.content,
          is_private: n.is_private,
          created_at: n.created_at,
          updated_at: n.updated_at,
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
   * POST /gym/coach/students/:id/notes
   * Create a new note for a student
   */
  router.post('/coach/students/:id/notes', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id } = req.params;
      const { note_type, content, is_private = true } = req.body || {};

      if (!note_type || !content) {
        throw InvalidPayloadError('請提供筆記類型和內容');
      }

      const validTypes = ['PROGRESS', 'GOAL', 'INJURY', 'FEEDBACK', 'GENERAL'];
      if (!validTypes.includes(note_type)) {
        throw InvalidPayloadError(`筆記類型必須是: ${validTypes.join(', ')}`);
      }

      // Verify assignment
      const assignmentResult = await database.raw(`
        SELECT 1 FROM member_coaches
        WHERE coach_id = ? AND member_id = ? AND is_active = TRUE
      `, [coachId, id]);

      if (!(assignmentResult.rows?.[0] || assignmentResult[0])) {
        throw ForbiddenError('此學員未指派給您');
      }

      // Create note
      const insertResult = await database.raw(`
        INSERT INTO student_notes (coach_id, member_id, note_type, content, is_private)
        VALUES (?, ?, ?, ?, ?)
        RETURNING *
      `, [coachId, id, note_type, content, is_private]);

      const note = insertResult.rows?.[0] || insertResult[0];

      logger.info('Student note created', { coachId, memberId: id, noteType: note_type });

      res.status(201).json({
        success: true,
        message: '筆記已新增',
        data: {
          id: note.id,
          note_type: note.note_type,
          content: note.content,
          is_private: note.is_private,
          created_at: note.created_at,
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
   * PUT /gym/coach/students/:id/notes/:noteId
   * Update a note
   */
  router.put('/coach/students/:id/notes/:noteId', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id, noteId } = req.params;
      const { note_type, content, is_private } = req.body || {};

      // Verify note belongs to coach and student
      const noteResult = await database.raw(`
        SELECT * FROM student_notes
        WHERE id = ? AND coach_id = ? AND member_id = ?
      `, [noteId, coachId, id]);

      const note = noteResult.rows?.[0] || noteResult[0];

      if (!note) {
        throw NotFoundError('筆記不存在或無權限修改');
      }

      // Build update query
      const updates = [];
      const params = [];

      if (note_type !== undefined) {
        const validTypes = ['PROGRESS', 'GOAL', 'INJURY', 'FEEDBACK', 'GENERAL'];
        if (!validTypes.includes(note_type)) {
          throw InvalidPayloadError(`筆記類型必須是: ${validTypes.join(', ')}`);
        }
        updates.push('note_type = ?');
        params.push(note_type);
      }

      if (content !== undefined) {
        updates.push('content = ?');
        params.push(content);
      }

      if (is_private !== undefined) {
        updates.push('is_private = ?');
        params.push(is_private);
      }

      if (updates.length === 0) {
        throw InvalidPayloadError('請提供要更新的欄位');
      }

      updates.push('updated_at = NOW()');
      params.push(noteId);

      const updateResult = await database.raw(`
        UPDATE student_notes
        SET ${updates.join(', ')}
        WHERE id = ?
        RETURNING *
      `, params);

      const updatedNote = updateResult.rows?.[0] || updateResult[0];

      res.json({
        success: true,
        message: '筆記已更新',
        data: {
          id: updatedNote.id,
          note_type: updatedNote.note_type,
          content: updatedNote.content,
          is_private: updatedNote.is_private,
          created_at: updatedNote.created_at,
          updated_at: updatedNote.updated_at,
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
   * DELETE /gym/coach/students/:id/notes/:noteId
   * Delete a note
   */
  router.delete('/coach/students/:id/notes/:noteId', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id, noteId } = req.params;

      // Verify note belongs to coach and student
      const deleteResult = await database.raw(`
        DELETE FROM student_notes
        WHERE id = ? AND coach_id = ? AND member_id = ?
        RETURNING id
      `, [noteId, coachId, id]);

      if (!(deleteResult.rows?.[0] || deleteResult[0])) {
        throw NotFoundError('筆記不存在或無權限刪除');
      }

      logger.info('Student note deleted', { coachId, memberId: id, noteId });

      res.json({
        success: true,
        message: '筆記已刪除',
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerMemberCoachesRoutes;
