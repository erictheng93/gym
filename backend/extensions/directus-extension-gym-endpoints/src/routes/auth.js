/**
 * Authentication Routes
 * /gym/auth/*
 */

import crypto from 'crypto';
import {
  InvalidPayloadError,
  UnauthorizedError,
  NotFoundError,
} from '../utils/errors.js';
import { jwt } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';

/**
 * 註冊認證路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} memberAuthMiddleware - 會員認證中間件
 */
export function registerAuthRoutes(router, context, memberAuthMiddleware) {
  const { services, database, getSchema, env } = context;
  const { ItemsService, UsersService } = services;

  /**
   * POST /gym/auth/login
   * Email/Password login for members
   */
  router.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        throw InvalidPayloadError('email and password are required');
      }

      const authResponse = await fetch(`http://localhost:8055/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!authResponse.ok) {
        const errorData = await authResponse.json().catch(() => ({}));
        throw UnauthorizedError(errorData?.errors?.[0]?.message || '帳號或密碼錯誤');
      }

      const schema = await getSchema();
      const membersService = new ItemsService('members', {
        schema,
        knex: database,
      });

      const members = await membersService.readByQuery({
        filter: {
          email: { _eq: email },
          status: { _eq: 'ACTIVE' },
        },
        fields: ['id', 'member_code', 'full_name', 'phone', 'email', 'branch_id', 'status'],
        limit: 1,
      });

      if (members.length === 0) {
        throw NotFoundError('此帳號沒有關聯的會員資料');
      }

      const member = members[0];

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
   * POST /gym/auth/forgot-password
   * Send password reset email to member
   */
  router.post('/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body || {};

      if (!email) {
        throw InvalidPayloadError('email is required');
      }

      const schema = await getSchema();
      const membersService = new ItemsService('members', {
        schema,
        knex: database,
      });

      const members = await membersService.readByQuery({
        filter: {
          email: { _eq: email },
          status: { _eq: 'ACTIVE' },
        },
        fields: ['id', 'member_code', 'full_name', 'email', 'user_id'],
        limit: 1,
      });

      if (members.length === 0) {
        // Return same response for security (prevent email enumeration)
        res.json({
          success: true,
          message: '如果此郵箱有註冊帳號，您將收到密碼重置郵件',
        });
        return;
      }

      const member = members[0];

      if (!member.user_id) {
        // Return same response for security (prevent account enumeration)
        res.json({
          success: true,
          message: '如果此郵箱有註冊帳號，您將收到密碼重置郵件',
        });
        return;
      }

      const jwtSecret = env.SECRET || env.JWT_SECRET || 'default-secret-change-me';
      const resetToken = jwt.sign(
        {
          id: member.id,
          user_id: member.user_id,
          email: member.email,
          type: 'password_reset',
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      try {
        await database.raw(`
          INSERT INTO password_reset_tokens (id, member_id, token_hash, expires_at, created_at)
          VALUES (gen_random_uuid(), ?, ?, NOW() + INTERVAL '24 hours', NOW())
          ON CONFLICT (member_id) DO UPDATE
          SET token_hash = EXCLUDED.token_hash,
              expires_at = EXCLUDED.expires_at,
              used_at = NULL
        `, [member.id, crypto.createHash('sha256').update(resetToken).digest('hex')]);
      } catch (dbError) {
        // Create table if not exists
        await database.raw(`
          CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            member_id UUID NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
            token_hash VARCHAR(255) NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        await database.raw(`
          INSERT INTO password_reset_tokens (id, member_id, token_hash, expires_at, created_at)
          VALUES (gen_random_uuid(), ?, ?, NOW() + INTERVAL '24 hours', NOW())
        `, [member.id, crypto.createHash('sha256').update(resetToken).digest('hex')]);
      }

      const frontendUrl = process.env.MEMBER_APP_URL || 'http://localhost:3002';
      const resetUrl = `${frontendUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;

      try {
        const emailService = await import('../../directus-extension-gym-hooks/src/email-service.js');
        if (emailService && emailService.isEmailEnabled && emailService.isEmailEnabled()) {
          const emailContent = emailService.buildPasswordResetEmail({
            memberName: member.full_name,
            resetUrl: resetUrl,
            expiresIn: '24 小時',
          });
          await emailService.sendEmail({
            to: member.email,
            subject: emailContent.subject,
            html: emailContent.html,
          });
        }
        // Reset URL only returned to client in development mode (see response below)
      } catch {
        // Email service error - URL only available via development mode response
      }

      res.json({
        success: true,
        message: '如果此郵箱有註冊帳號，您將收到密碼重置郵件',
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
        throw InvalidPayloadError('token and new_password are required');
      }

      if (new_password.length < 8) {
        throw InvalidPayloadError('密碼至少需要 8 個字元');
      }
      if (!/\d/.test(new_password)) {
        throw InvalidPayloadError('密碼需要包含至少一個數字');
      }

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

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const tokenResult = await database.raw(`
        SELECT * FROM password_reset_tokens
        WHERE member_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()
      `, [decoded.id, tokenHash]);

      const tokenRecord = tokenResult.rows?.[0] || tokenResult[0];
      if (!tokenRecord) {
        throw UnauthorizedError('重置連結已使用或過期，請重新申請');
      }

      const usersService = new UsersService({
        schema: await getSchema(),
        knex: database,
      });

      await usersService.updateOne(decoded.user_id, {
        password: new_password,
      });

      await database.raw(`
        UPDATE password_reset_tokens
        SET used_at = NOW()
        WHERE member_id = ?
      `, [decoded.id]);

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
        throw InvalidPayloadError('current_password and new_password are required');
      }

      if (new_password.length < 8) {
        throw InvalidPayloadError('新密碼至少需要 8 個字元');
      }
      if (!/\d/.test(new_password)) {
        throw InvalidPayloadError('新密碼需要包含至少一個數字');
      }
      if (current_password === new_password) {
        throw InvalidPayloadError('新密碼不能與當前密碼相同');
      }

      const schema = await getSchema();
      const membersService = new ItemsService('members', {
        schema,
        knex: database,
      });

      const member = await membersService.readOne(memberId, {
        fields: ['id', 'email', 'user_id'],
      });

      if (!member || !member.user_id) {
        throw InvalidPayloadError('此帳號無法使用密碼修改功能');
      }

      const authResponse = await fetch(`http://localhost:8055/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: member.email, password: current_password }),
      });

      if (!authResponse.ok) {
        throw UnauthorizedError('當前密碼錯誤');
      }

      const usersService = new UsersService({
        schema,
        knex: database,
      });

      await usersService.updateOne(member.user_id, {
        password: new_password,
      });

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
}

export default registerAuthRoutes;
