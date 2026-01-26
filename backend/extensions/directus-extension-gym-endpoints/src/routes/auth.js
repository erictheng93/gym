/**
 * Authentication Routes
 * /gym/auth/*
 *
 * 使用獨立的 member_credentials 表進行認證
 * 不依賴 directus_users（除非使用 OAuth）
 */

import crypto from 'crypto';
import {
  InvalidPayloadError,
  UnauthorizedError,
  NotFoundError,
} from '../utils/errors.js';
import { jwt } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import { hashPassword, verifyPassword, validatePassword } from '../utils/password.js';

/**
 * 註冊認證路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} memberAuthMiddleware - 會員認證中間件
 */
export function registerAuthRoutes(router, context, memberAuthMiddleware) {
  const { services, database, getSchema, env } = context;
  const { ItemsService } = services;

  /**
   * POST /gym/auth/login
   * Email/Password login for members
   * 使用 member_credentials 表驗證密碼
   */
  router.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        throw InvalidPayloadError('請輸入電子郵件和密碼');
      }

      // 1. 查找會員
      const memberResult = await database.raw(`
        SELECT m.id, m.member_code, m.full_name, m.phone, m.email, m.branch_id, m.status,
               mc.password_hash, mc.failed_login_attempts, mc.locked_until
        FROM members m
        LEFT JOIN member_credentials mc ON mc.member_id = m.id
        WHERE LOWER(m.email) = LOWER(?) AND m.status = 'ACTIVE'
        LIMIT 1
      `, [email]);

      const member = memberResult.rows?.[0] || memberResult[0];

      if (!member) {
        throw UnauthorizedError('帳號或密碼錯誤');
      }

      // 2. 檢查帳號是否被鎖定
      if (member.locked_until && new Date(member.locked_until) > new Date()) {
        const remainingMinutes = Math.ceil((new Date(member.locked_until) - new Date()) / 60000);
        throw UnauthorizedError(`帳號已被暫時鎖定，請 ${remainingMinutes} 分鐘後再試`);
      }

      // 3. 檢查是否有設定密碼
      if (!member.password_hash) {
        throw UnauthorizedError('此帳號尚未設定密碼，請使用手機驗證碼登入或設定密碼');
      }

      // 4. 驗證密碼
      const isValidPassword = await verifyPassword(member.password_hash, password);

      if (!isValidPassword) {
        // 記錄失敗嘗試
        const newAttempts = (member.failed_login_attempts || 0) + 1;
        const lockUntil = newAttempts >= 5 ? "NOW() + INTERVAL '30 minutes'" : 'NULL';

        await database.raw(`
          UPDATE member_credentials
          SET failed_login_attempts = ?,
              last_failed_login_at = NOW(),
              locked_until = ${lockUntil},
              updated_at = NOW()
          WHERE member_id = ?
        `, [newAttempts, member.id]);

        if (newAttempts >= 5) {
          throw UnauthorizedError('登入失敗次數過多，帳號已被鎖定 30 分鐘');
        }

        throw UnauthorizedError('帳號或密碼錯誤');
      }

      // 5. 登入成功，重置失敗計數並更新登入記錄
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
      const userAgent = req.headers['user-agent'] || null;

      await database.raw(`
        UPDATE member_credentials
        SET failed_login_attempts = 0,
            locked_until = NULL,
            last_login_at = NOW(),
            last_login_ip = ?,
            last_login_user_agent = ?,
            updated_at = NOW()
        WHERE member_id = ?
      `, [clientIp, userAgent, member.id]);

      // 6. 產生 JWT tokens
      const jwtSecret = env.SECRET || env.JWT_SECRET || 'default-secret-change-me';
      const accessToken = jwt.sign(
        {
          id: member.id,
          type: 'member',
          member_code: member.member_code,
          branch_id: member.branch_id,
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      const refreshToken = jwt.sign(
        {
          id: member.id,
          type: 'member_refresh',
        },
        jwtSecret,
        { expiresIn: '7d' }
      );

      logger.info('Member login successful', { memberId: member.id, email: member.email });

      res.json({
        success: true,
        message: '登入成功',
        member: {
          id: member.id,
          member_code: member.member_code,
          full_name: member.full_name,
          status: member.status,
          branch_id: member.branch_id,
        },
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 86400,
      });
    } catch (error) {
      logger.error('Email login error', { error: error.message });
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/auth/set-password
   * Set password for a member (after OTP verification)
   * 用於首次設定密碼或 OTP 登入後設定密碼
   */
  router.post('/auth/set-password', memberAuthMiddleware, async (req, res) => {
    try {
      const { new_password } = req.body || {};
      const memberId = req.member.id;

      if (!new_password) {
        throw InvalidPayloadError('請輸入新密碼');
      }

      // 驗證密碼強度
      const validation = validatePassword(new_password);
      if (!validation.valid) {
        throw InvalidPayloadError(validation.message);
      }

      // 檢查是否已有密碼
      const credResult = await database.raw(`
        SELECT password_hash FROM member_credentials WHERE member_id = ?
      `, [memberId]);

      const cred = credResult.rows?.[0] || credResult[0];

      if (cred?.password_hash) {
        throw InvalidPayloadError('密碼已設定，請使用「修改密碼」功能');
      }

      // 雜湊並儲存密碼
      const passwordHash = await hashPassword(new_password);

      await database.raw(`
        UPDATE member_credentials
        SET password_hash = ?,
            password_updated_at = NOW(),
            updated_at = NOW()
        WHERE member_id = ?
      `, [passwordHash, memberId]);

      logger.info('Member password set', { memberId });

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
   * POST /gym/auth/forgot-password
   * Send password reset email to member
   */
  router.post('/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body || {};

      if (!email) {
        throw InvalidPayloadError('請輸入電子郵件');
      }

      // 查找會員
      const memberResult = await database.raw(`
        SELECT m.id, m.member_code, m.full_name, m.email
        FROM members m
        WHERE LOWER(m.email) = LOWER(?) AND m.status = 'ACTIVE'
        LIMIT 1
      `, [email]);

      const member = memberResult.rows?.[0] || memberResult[0];

      // 統一回應（防止帳號枚舉攻擊）
      const successResponse = {
        success: true,
        message: '如果此郵箱有註冊帳號，您將收到密碼重置郵件',
      };

      if (!member) {
        res.json(successResponse);
        return;
      }

      // 產生重置 token
      const jwtSecret = env.SECRET || env.JWT_SECRET || 'default-secret-change-me';
      const resetToken = jwt.sign(
        {
          id: member.id,
          email: member.email,
          type: 'password_reset',
        },
        jwtSecret,
        { expiresIn: '1h' }
      );

      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

      // 儲存 token hash 到 member_credentials
      await database.raw(`
        UPDATE member_credentials
        SET password_reset_token_hash = ?,
            password_reset_expires_at = NOW() + INTERVAL '1 hour',
            updated_at = NOW()
        WHERE member_id = ?
      `, [tokenHash, member.id]);

      // 發送重置郵件
      const frontendUrl = process.env.MEMBER_APP_URL || 'http://localhost:3002';
      const resetUrl = `${frontendUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;

      try {
        const emailService = await import('../../directus-extension-gym-hooks/src/email-service.js');
        if (emailService && emailService.isEmailEnabled && emailService.isEmailEnabled()) {
          const emailContent = emailService.buildPasswordResetEmail({
            memberName: member.full_name,
            resetUrl: resetUrl,
            expiresIn: '1 小時',
          });
          await emailService.sendEmail({
            to: member.email,
            subject: emailContent.subject,
            html: emailContent.html,
          });
        }
      } catch (emailError) {
        logger.error('Failed to send password reset email', { error: emailError.message });
      }

      res.json({
        ...successResponse,
        ...(process.env.NODE_ENV === 'development' && { resetUrl }),
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/auth/reset-password
   * Reset password using token
   */
  router.post('/auth/reset-password', async (req, res) => {
    try {
      const { token, new_password } = req.body || {};

      if (!token || !new_password) {
        throw InvalidPayloadError('缺少必要參數');
      }

      // 驗證密碼強度
      const validation = validatePassword(new_password);
      if (!validation.valid) {
        throw InvalidPayloadError(validation.message);
      }

      // 驗證 token
      const jwtSecret = env.SECRET || env.JWT_SECRET || 'default-secret-change-me';
      let decoded;
      try {
        decoded = jwt.verify(token, jwtSecret);
      } catch (e) {
        throw UnauthorizedError('重置連結已過期或無效，請重新申請');
      }

      if (decoded.type !== 'password_reset') {
        throw UnauthorizedError('無效的重置連結');
      }

      // 驗證 token hash
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const credResult = await database.raw(`
        SELECT member_id, password_reset_expires_at
        FROM member_credentials
        WHERE member_id = ?
          AND password_reset_token_hash = ?
          AND password_reset_expires_at > NOW()
      `, [decoded.id, tokenHash]);

      const cred = credResult.rows?.[0] || credResult[0];
      if (!cred) {
        throw UnauthorizedError('重置連結已使用或過期，請重新申請');
      }

      // 雜湊並更新密碼
      const passwordHash = await hashPassword(new_password);

      await database.raw(`
        UPDATE member_credentials
        SET password_hash = ?,
            password_updated_at = NOW(),
            password_reset_token_hash = NULL,
            password_reset_expires_at = NULL,
            failed_login_attempts = 0,
            locked_until = NULL,
            updated_at = NOW()
        WHERE member_id = ?
      `, [passwordHash, decoded.id]);

      logger.info('Member password reset successful', { memberId: decoded.id });

      res.json({
        success: true,
        message: '密碼重置成功，請使用新密碼登入',
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/auth/change-password
   * Change password for authenticated member
   */
  router.post('/auth/change-password', memberAuthMiddleware, async (req, res) => {
    try {
      const { current_password, new_password } = req.body || {};
      const memberId = req.member.id;

      if (!current_password || !new_password) {
        throw InvalidPayloadError('請輸入當前密碼和新密碼');
      }

      // 驗證新密碼強度
      const validation = validatePassword(new_password);
      if (!validation.valid) {
        throw InvalidPayloadError(validation.message);
      }

      if (current_password === new_password) {
        throw InvalidPayloadError('新密碼不能與當前密碼相同');
      }

      // 取得當前密碼 hash
      const credResult = await database.raw(`
        SELECT password_hash FROM member_credentials WHERE member_id = ?
      `, [memberId]);

      const cred = credResult.rows?.[0] || credResult[0];

      if (!cred?.password_hash) {
        throw InvalidPayloadError('此帳號尚未設定密碼，請使用「設定密碼」功能');
      }

      // 驗證當前密碼
      const isValidPassword = await verifyPassword(cred.password_hash, current_password);
      if (!isValidPassword) {
        throw UnauthorizedError('當前密碼錯誤');
      }

      // 雜湊並更新新密碼
      const passwordHash = await hashPassword(new_password);

      await database.raw(`
        UPDATE member_credentials
        SET password_hash = ?,
            password_updated_at = NOW(),
            updated_at = NOW()
        WHERE member_id = ?
      `, [passwordHash, memberId]);

      logger.info('Member password changed', { memberId });

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

  /**
   * GET /gym/auth/has-password
   * Check if authenticated member has a password set
   */
  router.get('/auth/has-password', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;

      const credResult = await database.raw(`
        SELECT password_hash IS NOT NULL as has_password
        FROM member_credentials
        WHERE member_id = ?
      `, [memberId]);

      const cred = credResult.rows?.[0] || credResult[0];

      res.json({
        success: true,
        has_password: cred?.has_password || false,
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerAuthRoutes;
