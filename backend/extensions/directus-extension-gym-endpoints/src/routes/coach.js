/**
 * Coach Routes
 * /gym/coach/*
 *
 * 教練專用 API 端點
 * - 認證：登入、刷新 token
 * - 個人資料：取得教練資訊
 * - 課程管理：課表、點名
 * - 學員管理：查看指派學員
 */

import {
  InvalidPayloadError,
  UnauthorizedError,
  NotFoundError,
} from '../utils/errors.js';
import { jwt } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import { hashPassword, verifyPassword, validatePassword } from '../utils/password.js';

/**
 * 註冊教練路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} coachAuthMiddleware - 教練認證中間件
 */
export function registerCoachRoutes(router, context, coachAuthMiddleware) {
  const { services, database, getSchema, env } = context;
  const { ItemsService } = services;

  // ============================================
  // Authentication Routes
  // ============================================

  /**
   * POST /gym/coach/auth/login
   * Coach login with email/employee_code and password
   */
  router.post('/coach/auth/login', async (req, res) => {
    try {
      const { email, employee_code, password } = req.body || {};

      if ((!email && !employee_code) || !password) {
        throw InvalidPayloadError('請輸入帳號和密碼');
      }

      // Find coach by email or employee_code
      const identifier = email || employee_code;
      const coachResult = await database.raw(`
        SELECT e.id, e.employee_code, e.full_name, e.email, e.phone, e.branch_id, e.status,
               e.job_title_id, jt.name as job_title_name, jt.code as job_title_code,
               cc.password_hash, cc.failed_login_attempts, cc.locked_until
        FROM employees e
        JOIN job_titles jt ON e.job_title_id = jt.id
        LEFT JOIN coach_credentials cc ON cc.employee_id = e.id
        WHERE (LOWER(e.email) = LOWER(?) OR LOWER(e.employee_code) = LOWER(?))
          AND e.status = 'ACTIVE'
        LIMIT 1
      `, [identifier, identifier]);

      const coach = coachResult.rows?.[0] || coachResult[0];

      if (!coach) {
        throw UnauthorizedError('帳號或密碼錯誤');
      }

      // Check if account is locked
      if (coach.locked_until && new Date(coach.locked_until) > new Date()) {
        const remainingMinutes = Math.ceil((new Date(coach.locked_until) - new Date()) / 60000);
        throw UnauthorizedError(`帳號已被暫時鎖定，請 ${remainingMinutes} 分鐘後再試`);
      }

      // Check if password is set
      if (!coach.password_hash) {
        throw UnauthorizedError('此帳號尚未設定密碼，請聯繫管理員');
      }

      // Verify password
      const isValidPassword = await verifyPassword(coach.password_hash, password);

      if (!isValidPassword) {
        // Record failed attempt
        const newAttempts = (coach.failed_login_attempts || 0) + 1;
        const lockUntil = newAttempts >= 5 ? "NOW() + INTERVAL '30 minutes'" : 'NULL';

        await database.raw(`
          UPDATE coach_credentials
          SET failed_login_attempts = ?,
              last_failed_login_at = NOW(),
              locked_until = ${lockUntil},
              updated_at = NOW()
          WHERE employee_id = ?
        `, [newAttempts, coach.id]);

        if (newAttempts >= 5) {
          throw UnauthorizedError('登入失敗次數過多，帳號已被鎖定 30 分鐘');
        }

        throw UnauthorizedError('帳號或密碼錯誤');
      }

      // Login successful, reset failed count and update login record
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
      const userAgent = req.headers['user-agent'] || null;

      await database.raw(`
        UPDATE coach_credentials
        SET failed_login_attempts = 0,
            locked_until = NULL,
            last_login_at = NOW(),
            last_login_ip = ?,
            last_login_user_agent = ?,
            updated_at = NOW()
        WHERE employee_id = ?
      `, [clientIp, userAgent, coach.id]);

      // Generate JWT tokens
      const jwtSecret = env.SECRET || env.JWT_SECRET || 'default-secret-change-me';
      const accessToken = jwt.sign(
        {
          id: coach.id,
          type: 'coach',
          employee_code: coach.employee_code,
          branch_id: coach.branch_id,
          job_title_code: coach.job_title_code,
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      const refreshToken = jwt.sign(
        {
          id: coach.id,
          type: 'coach_refresh',
        },
        jwtSecret,
        { expiresIn: '7d' }
      );

      logger.info('Coach login successful', { coachId: coach.id, email: coach.email });

      res.json({
        success: true,
        message: '登入成功',
        coach: {
          id: coach.id,
          employee_code: coach.employee_code,
          full_name: coach.full_name,
          email: coach.email,
          branch_id: coach.branch_id,
          job_title: coach.job_title_name,
        },
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 86400,
      });
    } catch (error) {
      logger.error('Coach login error', { error: error.message });
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/coach/auth/refresh
   * Refresh coach access token
   */
  router.post('/coach/auth/refresh', async (req, res) => {
    try {
      const { refresh_token } = req.body || {};

      if (!refresh_token) {
        throw InvalidPayloadError('缺少 refresh token');
      }

      const jwtSecret = env.SECRET || env.JWT_SECRET || 'default-secret-change-me';

      let decoded;
      try {
        decoded = jwt.verify(refresh_token, jwtSecret);
      } catch (e) {
        throw UnauthorizedError('Token 已過期或無效');
      }

      if (decoded.type !== 'coach_refresh') {
        throw UnauthorizedError('無效的 token 類型');
      }

      // Get coach info
      const coachResult = await database.raw(`
        SELECT e.id, e.employee_code, e.full_name, e.branch_id, e.status,
               jt.code as job_title_code
        FROM employees e
        JOIN job_titles jt ON e.job_title_id = jt.id
        WHERE e.id = ? AND e.status = 'ACTIVE'
      `, [decoded.id]);

      const coach = coachResult.rows?.[0] || coachResult[0];

      if (!coach) {
        throw UnauthorizedError('帳號不存在或已停用');
      }

      // Generate new tokens
      const accessToken = jwt.sign(
        {
          id: coach.id,
          type: 'coach',
          employee_code: coach.employee_code,
          branch_id: coach.branch_id,
          job_title_code: coach.job_title_code,
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      const newRefreshToken = jwt.sign(
        {
          id: coach.id,
          type: 'coach_refresh',
        },
        jwtSecret,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_in: 86400,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/coach/auth/set-password
   * Set password for first time (requires admin setup token or existing session)
   */
  router.post('/coach/auth/set-password', coachAuthMiddleware, async (req, res) => {
    try {
      const { new_password } = req.body || {};
      const coachId = req.coach.id;

      if (!new_password) {
        throw InvalidPayloadError('請輸入新密碼');
      }

      // Validate password strength
      const validation = validatePassword(new_password);
      if (!validation.valid) {
        throw InvalidPayloadError(validation.message);
      }

      // Check if already has password
      const credResult = await database.raw(`
        SELECT password_hash FROM coach_credentials WHERE employee_id = ?
      `, [coachId]);

      const cred = credResult.rows?.[0] || credResult[0];

      if (cred?.password_hash) {
        throw InvalidPayloadError('密碼已設定，請使用「修改密碼」功能');
      }

      // Hash and save password
      const passwordHash = await hashPassword(new_password);

      await database.raw(`
        UPDATE coach_credentials
        SET password_hash = ?,
            password_updated_at = NOW(),
            updated_at = NOW()
        WHERE employee_id = ?
      `, [passwordHash, coachId]);

      logger.info('Coach password set', { coachId });

      res.json({
        success: true,
        message: '密碼設定成功',
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/coach/auth/change-password
   * Change password for authenticated coach
   */
  router.post('/coach/auth/change-password', coachAuthMiddleware, async (req, res) => {
    try {
      const { current_password, new_password } = req.body || {};
      const coachId = req.coach.id;

      if (!current_password || !new_password) {
        throw InvalidPayloadError('請輸入當前密碼和新密碼');
      }

      // Validate new password strength
      const validation = validatePassword(new_password);
      if (!validation.valid) {
        throw InvalidPayloadError(validation.message);
      }

      if (current_password === new_password) {
        throw InvalidPayloadError('新密碼不能與當前密碼相同');
      }

      // Get current password hash
      const credResult = await database.raw(`
        SELECT password_hash FROM coach_credentials WHERE employee_id = ?
      `, [coachId]);

      const cred = credResult.rows?.[0] || credResult[0];

      if (!cred?.password_hash) {
        throw InvalidPayloadError('此帳號尚未設定密碼');
      }

      // Verify current password
      const isValidPassword = await verifyPassword(cred.password_hash, current_password);
      if (!isValidPassword) {
        throw UnauthorizedError('當前密碼錯誤');
      }

      // Hash and update new password
      const passwordHash = await hashPassword(new_password);

      await database.raw(`
        UPDATE coach_credentials
        SET password_hash = ?,
            password_updated_at = NOW(),
            updated_at = NOW()
        WHERE employee_id = ?
      `, [passwordHash, coachId]);

      logger.info('Coach password changed', { coachId });

      res.json({
        success: true,
        message: '密碼修改成功',
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  // ============================================
  // Profile Routes
  // ============================================

  /**
   * GET /gym/coach/me
   * Get current coach profile
   */
  router.get('/coach/me', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;

      const coachResult = await database.raw(`
        SELECT e.id, e.employee_code, e.full_name, e.phone, e.email,
               e.branch_id, e.status, e.hire_date,
               b.name as branch_name,
               jt.id as job_title_id, jt.name as job_title_name, jt.code as job_title_code
        FROM employees e
        JOIN branches b ON e.branch_id = b.id
        JOIN job_titles jt ON e.job_title_id = jt.id
        WHERE e.id = ?
      `, [coachId]);

      const coach = coachResult.rows?.[0] || coachResult[0];

      if (!coach) {
        throw NotFoundError('教練資料不存在');
      }

      // Get student count
      const studentCountResult = await database.raw(`
        SELECT COUNT(DISTINCT member_id) as count
        FROM member_coaches
        WHERE coach_id = ? AND is_active = TRUE
      `, [coachId]);
      const studentCount = parseInt(studentCountResult.rows?.[0]?.count || studentCountResult[0]?.count || 0);

      // Get today's class count
      const todayClassResult = await database.raw(`
        SELECT COUNT(*) as count
        FROM class_bookings
        WHERE coach_id = ?
          AND DATE(scheduled_at) = CURRENT_DATE
          AND status NOT IN ('MEMBER_CANCELLED', 'COACH_CANCELLED')
      `, [coachId]);
      const todayClassCount = parseInt(todayClassResult.rows?.[0]?.count || todayClassResult[0]?.count || 0);

      res.json({
        success: true,
        data: {
          id: coach.id,
          employee_code: coach.employee_code,
          full_name: coach.full_name,
          phone: coach.phone,
          email: coach.email,
          branch_id: coach.branch_id,
          branch_name: coach.branch_name,
          job_title: {
            id: coach.job_title_id,
            name: coach.job_title_name,
            code: coach.job_title_code,
          },
          hire_date: coach.hire_date,
          stats: {
            student_count: studentCount,
            today_class_count: todayClassCount,
          },
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
  // Schedule Routes
  // ============================================

  /**
   * GET /gym/coach/schedule
   * Get coach's weekly schedule
   */
  router.get('/coach/schedule', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { start_date, end_date } = req.query;

      // Default to current week
      const startDate = start_date || new Date().toISOString().split('T')[0];
      const endDateValue = end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Get class bookings
      const bookingsResult = await database.raw(`
        SELECT cb.id, cb.scheduled_at, cb.duration_minutes, cb.status, cb.notes,
               m.id as member_id, m.member_code, m.full_name as member_name,
               m.phone as member_phone,
               c.contract_no, mp.name as plan_name
        FROM class_bookings cb
        JOIN members m ON cb.member_id = m.id
        JOIN contracts c ON cb.contract_id = c.id
        JOIN membership_plans mp ON c.plan_id = mp.id
        WHERE cb.coach_id = ?
          AND DATE(cb.scheduled_at) >= ?
          AND DATE(cb.scheduled_at) <= ?
        ORDER BY cb.scheduled_at ASC
      `, [coachId, startDate, endDateValue]);

      const bookings = bookingsResult.rows || bookingsResult;

      // Get coach availability schedule
      const availabilityResult = await database.raw(`
        SELECT day_of_week, start_time, end_time, is_available
        FROM coach_schedules
        WHERE coach_id = ?
          AND (effective_from IS NULL OR effective_from <= ?)
          AND (effective_until IS NULL OR effective_until >= ?)
        ORDER BY day_of_week, start_time
      `, [coachId, endDateValue, startDate]);

      const availability = availabilityResult.rows || availabilityResult;

      res.json({
        success: true,
        data: {
          bookings: bookings.map(b => ({
            id: b.id,
            scheduled_at: b.scheduled_at,
            duration_minutes: b.duration_minutes,
            status: b.status,
            notes: b.notes,
            member: {
              id: b.member_id,
              member_code: b.member_code,
              full_name: b.member_name,
              phone: b.member_phone,
            },
            contract_no: b.contract_no,
            plan_name: b.plan_name,
          })),
          availability,
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
  // Classes Routes
  // ============================================

  /**
   * GET /gym/coach/classes
   * Get coach's upcoming classes
   */
  router.get('/coach/classes', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { date, status, limit = 20, offset = 0 } = req.query;

      let whereClause = 'WHERE cb.coach_id = ?';
      const params = [coachId];

      if (date) {
        whereClause += ' AND DATE(cb.scheduled_at) = ?';
        params.push(date);
      } else {
        // Default: upcoming classes
        whereClause += ' AND cb.scheduled_at >= NOW()';
      }

      if (status) {
        whereClause += ' AND cb.status = ?';
        params.push(status);
      }

      const classesResult = await database.raw(`
        SELECT cb.id, cb.scheduled_at, cb.duration_minutes, cb.status, cb.notes,
               cb.is_charged, cb.booked_by, cb.created_at,
               m.id as member_id, m.member_code, m.full_name as member_name,
               m.phone as member_phone, m.avatar as member_avatar,
               c.id as contract_id, c.contract_no, c.remaining_counts,
               mp.name as plan_name, mp.type as plan_type,
               b.name as branch_name
        FROM class_bookings cb
        JOIN members m ON cb.member_id = m.id
        JOIN contracts c ON cb.contract_id = c.id
        JOIN membership_plans mp ON c.plan_id = mp.id
        JOIN branches b ON cb.branch_id = b.id
        ${whereClause}
        ORDER BY cb.scheduled_at ASC
        LIMIT ? OFFSET ?
      `, [...params, parseInt(limit), parseInt(offset)]);

      const classes = classesResult.rows || classesResult;

      // Get total count
      const countResult = await database.raw(`
        SELECT COUNT(*) as total
        FROM class_bookings cb
        ${whereClause}
      `, params);
      const total = parseInt(countResult.rows?.[0]?.total || countResult[0]?.total || 0);

      res.json({
        success: true,
        data: classes.map(c => ({
          id: c.id,
          scheduled_at: c.scheduled_at,
          duration_minutes: c.duration_minutes,
          status: c.status,
          notes: c.notes,
          is_charged: c.is_charged,
          booked_by: c.booked_by,
          created_at: c.created_at,
          member: {
            id: c.member_id,
            member_code: c.member_code,
            full_name: c.member_name,
            phone: c.member_phone,
            avatar: c.member_avatar,
          },
          contract: {
            id: c.contract_id,
            contract_no: c.contract_no,
            remaining_counts: c.remaining_counts,
            plan_name: c.plan_name,
            plan_type: c.plan_type,
          },
          branch_name: c.branch_name,
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
   * GET /gym/coach/classes/:id
   * Get class details
   */
  router.get('/coach/classes/:id', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id } = req.params;

      const classResult = await database.raw(`
        SELECT cb.*,
               m.id as member_id, m.member_code, m.full_name as member_name,
               m.phone as member_phone, m.email as member_email,
               c.id as contract_id, c.contract_no, c.remaining_counts,
               mp.name as plan_name, mp.type as plan_type,
               b.name as branch_name
        FROM class_bookings cb
        JOIN members m ON cb.member_id = m.id
        JOIN contracts c ON cb.contract_id = c.id
        JOIN membership_plans mp ON c.plan_id = mp.id
        JOIN branches b ON cb.branch_id = b.id
        WHERE cb.id = ? AND cb.coach_id = ?
      `, [id, coachId]);

      const classData = classResult.rows?.[0] || classResult[0];

      if (!classData) {
        throw NotFoundError('課程不存在或無權限查看');
      }

      // Get class record if exists
      const recordResult = await database.raw(`
        SELECT * FROM class_records WHERE booking_id = ?
      `, [id]);
      const record = recordResult.rows?.[0] || recordResult[0];

      // Get lesson plan if exists
      const planResult = await database.raw(`
        SELECT * FROM lesson_plans WHERE session_id = ?
      `, [id]);
      const lessonPlan = planResult.rows?.[0] || planResult[0];

      res.json({
        success: true,
        data: {
          id: classData.id,
          scheduled_at: classData.scheduled_at,
          duration_minutes: classData.duration_minutes,
          status: classData.status,
          notes: classData.notes,
          is_charged: classData.is_charged,
          booked_by: classData.booked_by,
          cancelled_at: classData.cancelled_at,
          cancel_reason: classData.cancel_reason,
          member: {
            id: classData.member_id,
            member_code: classData.member_code,
            full_name: classData.member_name,
            phone: classData.member_phone,
            email: classData.member_email,
          },
          contract: {
            id: classData.contract_id,
            contract_no: classData.contract_no,
            remaining_counts: classData.remaining_counts,
            plan_name: classData.plan_name,
            plan_type: classData.plan_type,
          },
          branch_name: classData.branch_name,
          record: record || null,
          lesson_plan: lessonPlan || null,
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
   * POST /gym/coach/classes/:id/attendance
   * Mark class attendance and deduct from contract
   */
  router.post('/coach/classes/:id/attendance', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id } = req.params;
      const { attended = true, notes, class_record } = req.body || {};

      // Verify class belongs to coach
      const classResult = await database.raw(`
        SELECT cb.*, c.id as contract_id, mp.type as plan_type
        FROM class_bookings cb
        JOIN contracts c ON cb.contract_id = c.id
        JOIN membership_plans mp ON c.plan_id = mp.id
        WHERE cb.id = ? AND cb.coach_id = ?
      `, [id, coachId]);

      const classData = classResult.rows?.[0] || classResult[0];

      if (!classData) {
        throw NotFoundError('課程不存在或無權限操作');
      }

      if (classData.status !== 'BOOKED') {
        throw InvalidPayloadError(`無法對狀態為 ${classData.status} 的課程進行點名`);
      }

      if (attended) {
        // Mark as completed
        await database.raw(`
          UPDATE class_bookings
          SET status = 'COMPLETED',
              is_charged = TRUE,
              notes = COALESCE(?, notes),
              updated_at = NOW()
          WHERE id = ?
        `, [notes, id]);

        // Deduct from COUNT_BASED contracts
        if (classData.plan_type === 'COUNT_BASED') {
          await database.raw(`
            UPDATE contracts
            SET remaining_counts = remaining_counts - 1,
                updated_at = NOW()
            WHERE id = ? AND remaining_counts > 0
          `, [classData.contract_id]);
        }

        // Create class record if provided
        if (class_record) {
          await database.raw(`
            INSERT INTO class_records (
              booking_id, coach_id, member_id, class_date,
              warmup_content, main_content, cooldown_content,
              member_condition, coach_notes, next_plan
            ) VALUES (?, ?, ?, CURRENT_DATE, ?, ?, ?, ?, ?, ?)
          `, [
            id, coachId, classData.member_id,
            class_record.warmup || null,
            JSON.stringify(class_record.main || {}),
            class_record.cooldown || null,
            class_record.member_condition || null,
            class_record.coach_notes || null,
            class_record.next_plan || null,
          ]);
        }

        logger.info('Class attendance marked: COMPLETED', { classId: id, coachId });

        res.json({
          success: true,
          message: '已完成點名',
          status: 'COMPLETED',
        });
      } else {
        // Mark as no-show
        await database.raw(`
          UPDATE class_bookings
          SET status = 'NO_SHOW',
              is_charged = TRUE,
              notes = COALESCE(?, notes),
              updated_at = NOW()
          WHERE id = ?
        `, [notes, id]);

        // Still deduct from COUNT_BASED contracts for no-show
        if (classData.plan_type === 'COUNT_BASED') {
          await database.raw(`
            UPDATE contracts
            SET remaining_counts = remaining_counts - 1,
                updated_at = NOW()
            WHERE id = ? AND remaining_counts > 0
          `, [classData.contract_id]);
        }

        logger.info('Class attendance marked: NO_SHOW', { classId: id, coachId });

        res.json({
          success: true,
          message: '已標記為未到',
          status: 'NO_SHOW',
        });
      }
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/coach/classes/:id/cancel
   * Cancel a class (coach-initiated)
   */
  router.post('/coach/classes/:id/cancel', coachAuthMiddleware, async (req, res) => {
    try {
      const coachId = req.coach.id;
      const { id } = req.params;
      const { reason } = req.body || {};

      if (!reason) {
        throw InvalidPayloadError('請提供取消原因');
      }

      // Verify class belongs to coach
      const classResult = await database.raw(`
        SELECT * FROM class_bookings
        WHERE id = ? AND coach_id = ? AND status = 'BOOKED'
      `, [id, coachId]);

      const classData = classResult.rows?.[0] || classResult[0];

      if (!classData) {
        throw NotFoundError('課程不存在或已無法取消');
      }

      await database.raw(`
        UPDATE class_bookings
        SET status = 'COACH_CANCELLED',
            cancelled_at = NOW(),
            cancel_reason = ?,
            updated_at = NOW()
        WHERE id = ?
      `, [reason, id]);

      logger.info('Class cancelled by coach', { classId: id, coachId, reason });

      res.json({
        success: true,
        message: '課程已取消',
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerCoachRoutes;
