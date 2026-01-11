/**
 * OTP Authentication Routes
 * /gym/otp/*
 */

import {
  InvalidPayloadError,
  UnauthorizedError,
  NotFoundError,
  TooManyRequestsError,
} from '../utils/errors.js';
import { jwt } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';

/**
 * 註冊 OTP 路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerOtpRoutes(router, context) {
  const { services, database, getSchema, env } = context;
  const { ItemsService } = services;

  /**
   * POST /gym/otp/send
   * Send OTP to phone or email
   */
  router.post('/otp/send', async (req, res) => {
    try {
      const { identifier, type = 'phone' } = req.body || {};

      if (!identifier) {
        throw InvalidPayloadError('identifier is required');
      }

      if (!['phone', 'email'].includes(type)) {
        throw InvalidPayloadError('type must be "phone" or "email"');
      }

      const ipAddress = req.ip || req.connection?.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;

      const result = await database.raw(`
        SELECT * FROM generate_otp(?::varchar, ?::varchar, ?::inet, ?::text)
      `, [identifier, type, ipAddress, userAgent]);

      const row = result.rows?.[0] || result[0];

      if (!row || !row.success) {
        if (row?.message?.includes('上限') || row?.message?.includes('稍後')) {
          throw TooManyRequestsError(row?.message || 'Rate limit exceeded');
        }
        throw InvalidPayloadError(row?.message || 'Failed to generate OTP');
      }

      // OTP code only returned to client in development mode (see below)

      res.json({
        success: true,
        message: row.message,
        expiresIn: 300,
        ...(process.env.NODE_ENV === 'development' && { otp: row.otp_code }),
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/otp/verify
   * Verify OTP and return JWT token
   */
  router.post('/otp/verify', async (req, res) => {
    try {
      const { identifier, type = 'phone', code } = req.body || {};

      if (!identifier || !code) {
        throw InvalidPayloadError('identifier and code are required');
      }

      if (!['phone', 'email'].includes(type)) {
        throw InvalidPayloadError('type must be "phone" or "email"');
      }

      const result = await database.raw(`
        SELECT * FROM verify_otp(?::varchar, ?::varchar, ?::varchar)
      `, [identifier, type, code]);

      const row = result.rows?.[0] || result[0];

      if (!row || !row.success) {
        throw UnauthorizedError(row?.message || 'Invalid or expired OTP');
      }

      const memberId = row.member_id;

      const schema = await getSchema();
      const membersService = new ItemsService('members', {
        schema,
        knex: database,
      });

      const member = await membersService.readOne(memberId, {
        fields: ['id', 'member_code', 'full_name', 'phone', 'email', 'branch_id', 'member_status'],
      });

      if (!member) {
        throw NotFoundError('Member not found');
      }

      const jwtSecret = env.SECRET || env.JWT_SECRET || 'default-secret-change-me';
      const accessToken = jwt.sign(
        {
          id: memberId,
          type: 'member',
          member_code: member.member_code,
          branch_id: member.branch_id,
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      const refreshToken = jwt.sign(
        {
          id: memberId,
          type: 'member_refresh',
        },
        jwtSecret,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        message: row.message,
        member: {
          id: member.id,
          member_code: member.member_code,
          full_name: member.full_name,
          member_status: member.member_status,
          branch_id: member.branch_id,
        },
        access_token: accessToken,
        refresh_token: refreshToken,
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
   * POST /gym/otp/refresh
   * Refresh access token using refresh token
   */
  router.post('/otp/refresh', async (req, res) => {
    try {
      const { refresh_token } = req.body || {};

      if (!refresh_token) {
        throw InvalidPayloadError('refresh_token is required');
      }

      const jwtSecret = env.SECRET || env.JWT_SECRET || 'default-secret-change-me';

      let decoded;
      try {
        decoded = jwt.verify(refresh_token, jwtSecret);
      } catch (e) {
        throw UnauthorizedError('Invalid or expired refresh token');
      }

      if (decoded.type !== 'member_refresh') {
        throw UnauthorizedError('Invalid token type');
      }

      const schema = await getSchema();
      const membersService = new ItemsService('members', {
        schema,
        knex: database,
      });

      const member = await membersService.readOne(decoded.id, {
        fields: ['id', 'member_code', 'full_name', 'branch_id', 'member_status', 'status'],
      });

      if (!member || member.status !== 'active') {
        throw NotFoundError('Member not found or inactive');
      }

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

      const newRefreshToken = jwt.sign(
        {
          id: member.id,
          type: 'member_refresh',
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
      logger.error('Token refresh error', { error: error.message });
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerOtpRoutes;
