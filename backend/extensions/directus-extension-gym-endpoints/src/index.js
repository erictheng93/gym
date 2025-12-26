/**
 * Gym Custom API Endpoints
 *
 * 1. OTP Authentication - Send/Verify OTP for member login
 * 2. QR Code Checkin - Verify QR code and process member check-in
 * 3. Class Bookings - Book/cancel classes with atomic operations
 * 4. Push Notifications - VAPID key and subscription management
 */

import crypto from 'crypto';

// ============================================
// Simple JWT implementation (無需外部依賴)
// ============================================
const base64url = (str) => {
  return Buffer.from(str).toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

const base64urlDecode = (str) => {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
};

const parseExpiry = (str) => {
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) return 3600;
  const [, num, unit] = match;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return parseInt(num) * (multipliers[unit] || 3600);
};

const jwt = {
  sign: (payload, secret, options = {}) => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);

    let exp = null;
    if (options.expiresIn) {
      exp = typeof options.expiresIn === 'number'
        ? now + options.expiresIn
        : now + parseExpiry(options.expiresIn);
    }

    const fullPayload = { ...payload, iat: now };
    if (exp) fullPayload.exp = exp;

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(fullPayload));
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  },

  verify: (token, secret) => {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    if (signature !== expectedSig) throw new Error('Invalid signature');

    const payload = JSON.parse(base64urlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token expired');
    }

    return payload;
  }
};

// Custom error class (不依賴 @directus/errors)
class CustomError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'CustomError';
  }
}

// Custom error types
const InvalidPayloadError = (msg) => new CustomError('INVALID_PAYLOAD', msg || 'Invalid request payload', 400);
const UnauthorizedError = (msg) => new CustomError('UNAUTHORIZED', msg || 'Authentication required', 401);
const ForbiddenError = (msg) => new CustomError('FORBIDDEN', msg || 'Access denied', 403);
const NotFoundError = (msg) => new CustomError('NOT_FOUND', msg || 'Resource not found', 404);
const TooManyRequestsError = (msg) => new CustomError('TOO_MANY_REQUESTS', msg || 'Rate limit exceeded', 429);

export default {
  id: 'gym',
  handler: (router, { services, database, getSchema, env }) => {
    const { ItemsService, UsersService } = services;

    // ============================================
    // Middleware: Parse JSON body
    // ============================================
    router.use((req, res, next) => {
      // Ensure JSON content type is handled
      if (req.is('application/json')) {
        // Body should already be parsed by Directus
      }
      next();
    });

    // ============================================
    // 1. OTP Authentication Endpoints
    // ============================================

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

        // Get client IP
        const ipAddress = req.ip || req.connection?.remoteAddress || null;
        const userAgent = req.headers['user-agent'] || null;

        // Call the atomic function to generate OTP
        const result = await database.raw(`
          SELECT * FROM generate_otp(?::varchar, ?::varchar, ?::inet, ?::text)
        `, [identifier, type, ipAddress, userAgent]);

        const row = result.rows?.[0] || result[0];

        if (!row || !row.success) {
          // Rate limit exceeded or other error
          if (row?.message?.includes('上限') || row?.message?.includes('稍後')) {
            throw TooManyRequestsError(row?.message || 'Rate limit exceeded');
          }
          throw InvalidPayloadError(row?.message || 'Failed to generate OTP');
        }

        // In development, log the OTP to console
        console.log(`[GymEndpoint] OTP for ${identifier}: ${row.otp_code}`);

        // TODO: In production, send via SMS or Email
        // For now, just console log (development mode)

        res.json({
          success: true,
          message: row.message,
          expiresIn: 300, // 5 minutes
          // Only include OTP in development for testing
          ...(process.env.NODE_ENV === 'development' && { otp: row.otp_code }),
        });
      } catch (error) {
        console.error('[GymEndpoint] OTP send error:', error);
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

        // Call the atomic function to verify OTP
        const result = await database.raw(`
          SELECT * FROM verify_otp(?::varchar, ?::varchar, ?::varchar)
        `, [identifier, type, code]);

        const row = result.rows?.[0] || result[0];

        if (!row || !row.success) {
          throw UnauthorizedError(row?.message || 'Invalid or expired OTP');
        }

        const memberId = row.member_id;

        // Get member details
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

        // Generate JWT token for member
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

        console.log(`[GymEndpoint] Member ${member.member_code} authenticated via OTP`);

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
          expires_in: 86400, // 24 hours
        });
      } catch (error) {
        console.error('[GymEndpoint] OTP verify error:', error);
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

        // Verify refresh token
        let decoded;
        try {
          decoded = jwt.verify(refresh_token, jwtSecret);
        } catch (e) {
          throw UnauthorizedError('Invalid or expired refresh token');
        }

        if (decoded.type !== 'member_refresh') {
          throw UnauthorizedError('Invalid token type');
        }

        // Get member details
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

        // Generate new tokens
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
        console.error('[GymEndpoint] Token refresh error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * POST /gym/auth/login
     * Email/Password login for members
     * Verifies credentials via Directus, then looks up member by email
     */
    router.post('/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body || {};

        if (!email || !password) {
          throw InvalidPayloadError('email and password are required');
        }

        // Verify credentials with Directus
        const authResponse = await fetch(`http://localhost:8055/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!authResponse.ok) {
          const errorData = await authResponse.json().catch(() => ({}));
          throw UnauthorizedError(errorData?.errors?.[0]?.message || '帳號或密碼錯誤');
        }

        // Credentials valid, now find member by email
        const schema = await getSchema();
        const membersService = new ItemsService('members', {
          schema,
          knex: database,
        });

        const members = await membersService.readByQuery({
          filter: {
            email: { _eq: email },
            status: { _eq: 'active' },
          },
          fields: ['id', 'member_code', 'full_name', 'phone', 'email', 'branch_id', 'member_status'],
          limit: 1,
        });

        if (members.length === 0) {
          throw NotFoundError('此帳號沒有關聯的會員資料');
        }

        const member = members[0];

        // Generate member JWT token
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

        console.log(`[GymEndpoint] Member ${member.member_code} authenticated via email/password`);

        res.json({
          success: true,
          message: '登入成功',
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
        console.error('[GymEndpoint] Email login error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    // ============================================
    // Member Authentication Middleware
    // ============================================

    const memberAuthMiddleware = async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw UnauthorizedError('Authorization header required');
        }

        const token = authHeader.substring(7);
        const jwtSecret = env.SECRET || env.JWT_SECRET || 'default-secret-change-me';

        let decoded;
        try {
          decoded = jwt.verify(token, jwtSecret);
        } catch (e) {
          throw UnauthorizedError('Invalid or expired token');
        }

        if (decoded.type !== 'member') {
          throw UnauthorizedError('Invalid token type');
        }

        req.member = decoded;
        next();
      } catch (error) {
        res.status(error.status || 401).json({
          success: false,
          message: error.message || 'Authentication failed',
        });
      }
    };

    // ============================================
    // 2. QR Code Check-in Endpoint
    // ============================================

    /**
     * POST /gym/checkin/qr-verify
     * Verify QR code and process member check-in
     */
    router.post('/checkin/qr-verify', async (req, res) => {
      try {
        const { payload, branch_id, verified_by } = req.body || {};

        if (!payload) {
          throw InvalidPayloadError('QR payload is required');
        }

        // Parse QR payload
        let qrData;
        try {
          qrData = typeof payload === 'string' ? JSON.parse(payload) : payload;
        } catch (e) {
          throw InvalidPayloadError('Invalid QR code format');
        }

        const { m: memberCode, t: timestamp, c: contractId } = qrData;

        if (!memberCode || !timestamp) {
          throw InvalidPayloadError('Invalid QR code data');
        }

        // Verify timestamp (30 seconds validity)
        const now = Date.now();
        const qrTime = Number(timestamp);
        if (isNaN(qrTime) || Math.abs(now - qrTime) > 30000) {
          throw InvalidPayloadError('QR Code 已過期，請重新掃描');
        }

        const schema = await getSchema();

        // Find member by member_code
        const membersService = new ItemsService('members', {
          schema,
          knex: database,
        });

        const members = await membersService.readByQuery({
          filter: {
            member_code: { _eq: memberCode },
            status: { _eq: 'active' },
          },
          fields: ['id', 'member_code', 'full_name', 'member_status', 'branch_id'],
          limit: 1,
        });

        if (members.length === 0) {
          throw NotFoundError('會員不存在');
        }

        const member = members[0];

        if (member.member_status !== 'ACTIVE') {
          throw ForbiddenError(`會員狀態為 ${member.member_status}，無法入場`);
        }

        // Get active contract
        const contractsService = new ItemsService('contracts', {
          schema,
          knex: database,
        });

        const today = new Date().toISOString().split('T')[0];
        let contract;

        if (contractId) {
          // Use specified contract
          contract = await contractsService.readOne(contractId, {
            fields: ['id', 'contract_no', 'contract_status', 'remaining_counts', 'end_date', 'plan_id'],
          });

          if (!contract || contract.contract_status !== 'ACTIVE') {
            throw ForbiddenError('指定的合約無效');
          }
        } else {
          // Find active contract
          const contracts = await contractsService.readByQuery({
            filter: {
              _and: [
                { member_id: { _eq: member.id } },
                { contract_status: { _eq: 'ACTIVE' } },
                { status: { _eq: 'active' } },
                {
                  _or: [
                    { end_date: { _gte: today } },
                    { end_date: { _null: true } },
                  ],
                },
              ],
            },
            fields: ['id', 'contract_no', 'contract_status', 'remaining_counts', 'end_date', 'plan_id'],
            limit: 1,
          });

          if (contracts.length === 0) {
            throw ForbiddenError('沒有有效合約，無法入場');
          }

          contract = contracts[0];
        }

        // Get plan info
        const plansService = new ItemsService('membership_plans', {
          schema,
          knex: database,
        });

        const plan = await plansService.readOne(contract.plan_id, {
          fields: ['id', 'name', 'plan_type'],
        });

        // Check if count-based and has remaining counts
        if (plan?.plan_type === 'COUNT_BASED' && contract.remaining_counts !== null) {
          if (contract.remaining_counts <= 0) {
            throw ForbiddenError('剩餘次數不足，無法入場');
          }
        }

        // Create check-in record
        const checkinsService = new ItemsService('member_checkins', {
          schema,
          knex: database,
        });

        const checkinData = {
          member_id: member.id,
          contract_id: contract.id,
          branch_id: branch_id || member.branch_id,
          check_time: new Date().toISOString(),
          check_type: 'ENTRY',
          verification_method: 'QR_CODE',
          verified_by: verified_by || null,
          is_cross_branch: branch_id && member.branch_id && branch_id !== member.branch_id,
          qr_payload: qrData,
          verification_timestamp: new Date(qrTime).toISOString(),
        };

        const checkinId = await checkinsService.createOne(checkinData);

        // Deduct count if needed (handled by hooks)

        console.log(`[GymEndpoint] QR check-in: member ${member.member_code} at branch ${branch_id || member.branch_id}`);

        res.json({
          success: true,
          message: '入場成功',
          checkin_id: checkinId,
          member: {
            id: member.id,
            member_code: member.member_code,
            full_name: member.full_name,
          },
          contract: {
            id: contract.id,
            contract_no: contract.contract_no,
            plan_name: plan?.name,
            plan_type: plan?.plan_type,
            remaining_counts: contract.remaining_counts,
            end_date: contract.end_date,
          },
        });
      } catch (error) {
        console.error('[GymEndpoint] QR check-in error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    // ============================================
    // 2.5. Batch Check-in Endpoint (第二階段優化)
    // ============================================

    /**
     * POST /gym/checkin/batch
     * Batch check-in multiple members at once
     * 支援教練課、團體課等多人同時簽到場景
     */
    router.post('/checkin/batch', async (req, res) => {
      const startTime = Date.now();

      try {
        const { member_ids, branch_id, verified_by, check_type = 'ENTRY', notes } = req.body || {};

        if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
          throw InvalidPayloadError('member_ids array is required');
        }

        if (member_ids.length > 50) {
          throw InvalidPayloadError('Maximum 50 members per batch');
        }

        const schema = await getSchema();
        const membersService = new ItemsService('members', { schema, knex: database });
        const contractsService = new ItemsService('contracts', { schema, knex: database });
        const checkinsService = new ItemsService('member_checkins', { schema, knex: database });

        const today = new Date().toISOString().split('T')[0];
        const checkTime = new Date().toISOString();

        const results = [];
        const successIds = [];
        const failedIds = [];

        // 批量獲取會員資料
        const members = await membersService.readByQuery({
          filter: {
            id: { _in: member_ids },
            status: { _eq: 'active' },
          },
          fields: ['id', 'member_code', 'full_name', 'member_status', 'branch_id'],
        });

        const memberMap = new Map(members.map(m => [m.id, m]));

        // 批量獲取有效合約
        const contracts = await contractsService.readByQuery({
          filter: {
            _and: [
              { member_id: { _in: member_ids } },
              { contract_status: { _eq: 'ACTIVE' } },
              { status: { _eq: 'active' } },
              {
                _or: [
                  { end_date: { _gte: today } },
                  { end_date: { _null: true } },
                ],
              },
            ],
          },
          fields: ['id', 'member_id', 'remaining_counts', 'end_date'],
        });

        // 建立會員 -> 合約的映射
        const contractMap = new Map();
        for (const contract of contracts) {
          if (!contractMap.has(contract.member_id)) {
            contractMap.set(contract.member_id, contract);
          }
        }

        // 處理每個會員
        for (const memberId of member_ids) {
          const member = memberMap.get(memberId);

          if (!member) {
            failedIds.push(memberId);
            results.push({
              member_id: memberId,
              success: false,
              error: '會員不存在',
            });
            continue;
          }

          if (member.member_status !== 'ACTIVE') {
            failedIds.push(memberId);
            results.push({
              member_id: memberId,
              member_code: member.member_code,
              full_name: member.full_name,
              success: false,
              error: `會員狀態為 ${member.member_status}`,
            });
            continue;
          }

          const contract = contractMap.get(memberId);
          if (!contract) {
            failedIds.push(memberId);
            results.push({
              member_id: memberId,
              member_code: member.member_code,
              full_name: member.full_name,
              success: false,
              error: '沒有有效合約',
            });
            continue;
          }

          // 建立簽到記錄
          try {
            const checkinData = {
              member_id: memberId,
              contract_id: contract.id,
              branch_id: branch_id || member.branch_id,
              check_time: checkTime,
              check_type,
              verification_method: 'BATCH',
              verified_by: verified_by || null,
              is_cross_branch: branch_id && member.branch_id && branch_id !== member.branch_id,
              notes: notes || null,
            };

            const checkinId = await checkinsService.createOne(checkinData);

            successIds.push(memberId);
            results.push({
              member_id: memberId,
              member_code: member.member_code,
              full_name: member.full_name,
              success: true,
              checkin_id: checkinId,
              remaining_counts: contract.remaining_counts !== null ? contract.remaining_counts - 1 : null,
            });
          } catch (checkinError) {
            failedIds.push(memberId);
            results.push({
              member_id: memberId,
              member_code: member.member_code,
              full_name: member.full_name,
              success: false,
              error: checkinError.message || '簽到失敗',
            });
          }
        }

        const duration = Date.now() - startTime;
        console.log(`[GymEndpoint] Batch check-in: ${successIds.length}/${member_ids.length} success in ${duration}ms`);

        res.json({
          success: true,
          message: `成功簽到 ${successIds.length} 人，失敗 ${failedIds.length} 人`,
          stats: {
            total: member_ids.length,
            success: successIds.length,
            failed: failedIds.length,
            duration_ms: duration,
          },
          results,
        });
      } catch (error) {
        console.error('[GymEndpoint] Batch check-in error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * GET /gym/cache/stats
     * Get cache statistics (admin only)
     */
    router.get('/cache/stats', async (req, res) => {
      try {
        // Get Redis cache stats
        const result = await database.raw(`
          SELECT
            (SELECT COUNT(*) FROM contracts WHERE contract_status = 'ACTIVE') as active_contracts,
            (SELECT COUNT(*) FROM members WHERE member_status = 'ACTIVE') as active_members,
            (SELECT COUNT(*) FROM member_checkins WHERE check_time >= CURRENT_DATE) as today_checkins
        `);

        const row = result.rows?.[0] || result[0];

        res.json({
          success: true,
          database: {
            active_contracts: row?.active_contracts || 0,
            active_members: row?.active_members || 0,
            today_checkins: row?.today_checkins || 0,
          },
          cache: {
            status: 'Check Redis directly at port 6379',
            note: 'Use redis-cli INFO for detailed stats',
          },
        });
      } catch (error) {
        console.error('[GymEndpoint] Cache stats error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    // ============================================
    // 3. Class Booking Endpoints
    // ============================================

    /**
     * GET /gym/classes
     * Get available class sessions
     */
    router.get('/classes', async (req, res) => {
      try {
        const { branch_id, date_from, date_to, category } = req.query;

        const schema = await getSchema();
        const sessionsService = new ItemsService('class_sessions', {
          schema,
          knex: database,
        });

        const filter = {
          _and: [
            { session_status: { _eq: 'SCHEDULED' } },
            { status: { _eq: 'active' } },
          ],
        };

        if (branch_id) {
          filter._and.push({ branch_id: { _eq: branch_id } });
        }

        if (date_from) {
          filter._and.push({ session_date: { _gte: date_from } });
        } else {
          // Default to today onwards
          filter._and.push({ session_date: { _gte: new Date().toISOString().split('T')[0] } });
        }

        if (date_to) {
          filter._and.push({ session_date: { _lte: date_to } });
        }

        const sessions = await sessionsService.readByQuery({
          filter,
          fields: [
            'id', 'session_date', 'start_time', 'end_time', 'room',
            'max_capacity', 'current_count', 'waitlist_count', 'session_status',
            'class_id.id', 'class_id.name', 'class_id.description', 'class_id.category',
            'class_id.difficulty_level', 'class_id.duration_minutes', 'class_id.image_url',
            'instructor_id.id', 'instructor_id.full_name',
            'branch_id.id', 'branch_id.name',
          ],
          sort: ['session_date', 'start_time'],
          limit: 100,
        });

        // Filter by category if specified
        let filteredSessions = sessions;
        if (category) {
          filteredSessions = sessions.filter(s => s.class_id?.category === category);
        }

        res.json({
          success: true,
          data: filteredSessions,
        });
      } catch (error) {
        console.error('[GymEndpoint] Get classes error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * GET /gym/classes/schedule
     * Get weekly schedule
     */
    router.get('/classes/schedule', async (req, res) => {
      try {
        const { branch_id, week_start } = req.query;

        const schema = await getSchema();
        const schedulesService = new ItemsService('class_schedules', {
          schema,
          knex: database,
        });

        const filter = {
          _and: [
            { status: { _eq: 'active' } },
            { is_recurring: { _eq: true } },
          ],
        };

        if (branch_id) {
          filter._and.push({ branch_id: { _eq: branch_id } });
        }

        const schedules = await schedulesService.readByQuery({
          filter,
          fields: [
            'id', 'day_of_week', 'start_time', 'end_time', 'room', 'max_capacity',
            'class_id.id', 'class_id.name', 'class_id.category', 'class_id.difficulty_level',
            'class_id.duration_minutes', 'class_id.image_url',
            'instructor_id.id', 'instructor_id.full_name',
            'branch_id.id', 'branch_id.name',
          ],
          sort: ['day_of_week', 'start_time'],
        });

        res.json({
          success: true,
          data: schedules,
        });
      } catch (error) {
        console.error('[GymEndpoint] Get schedule error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

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

        // Call atomic booking function
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

        // Verify booking belongs to member
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

        // Call atomic cancel function
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
     * GET /gym/classes/sessions
     * Get upcoming class sessions
     */
    router.get('/classes/sessions', async (req, res) => {
      try {
        const { branch_id, start_date, end_date, limit = 50 } = req.query;

        const schema = await getSchema();
        const sessionsService = new ItemsService('class_sessions', {
          schema,
          knex: database,
        });

        const today = new Date().toISOString().split('T')[0];
        const filter = {
          _and: [
            { session_status: { _in: ['SCHEDULED', 'IN_PROGRESS'] } },
            { status: { _eq: 'active' } },
            { session_date: { _gte: start_date || today } },
          ],
        };

        if (end_date) {
          filter._and.push({ session_date: { _lte: end_date } });
        }

        if (branch_id) {
          filter._and.push({ branch_id: { _eq: branch_id } });
        }

        const sessions = await sessionsService.readByQuery({
          filter,
          fields: [
            'id', 'session_date', 'current_count', 'waitlist_count', 'session_status',
            'schedule_id.id', 'schedule_id.start_time', 'schedule_id.end_time', 'schedule_id.room',
            'schedule_id.max_capacity',
            'schedule_id.class_id.id', 'schedule_id.class_id.name', 'schedule_id.class_id.description',
            'schedule_id.class_id.category', 'schedule_id.class_id.difficulty_level',
            'schedule_id.class_id.duration_minutes', 'schedule_id.class_id.max_capacity',
            'schedule_id.instructor_id.id', 'schedule_id.instructor_id.full_name',
            'schedule_id.branch_id.id', 'schedule_id.branch_id.name',
          ],
          sort: ['session_date', 'schedule_id.start_time'],
          limit: Number(limit),
        });

        // Transform data for frontend compatibility
        const transformedSessions = sessions.map(s => ({
          id: s.id,
          session_date: s.session_date,
          current_count: s.current_count,
          waitlist_count: s.waitlist_count,
          session_status: s.session_status,
          schedule: s.schedule_id ? {
            id: s.schedule_id.id,
            start_time: s.schedule_id.start_time,
            end_time: s.schedule_id.end_time,
            room: s.schedule_id.room,
            max_capacity: s.schedule_id.max_capacity,
            class: s.schedule_id.class_id,
            instructor: s.schedule_id.instructor_id,
            branch: s.schedule_id.branch_id,
          } : null,
          class: s.schedule_id?.class_id,
          instructor: s.schedule_id?.instructor_id,
          branch: s.schedule_id?.branch_id,
        }));

        res.json({
          success: true,
          data: transformedSessions,
        });
      } catch (error) {
        console.error('[GymEndpoint] Get sessions error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * GET /gym/classes/sessions/:id
     * Get single class session
     */
    router.get('/classes/sessions/:id', async (req, res) => {
      try {
        const sessionId = req.params.id;

        const schema = await getSchema();
        const sessionsService = new ItemsService('class_sessions', {
          schema,
          knex: database,
        });

        const session = await sessionsService.readOne(sessionId, {
          fields: [
            'id', 'session_date', 'current_count', 'waitlist_count', 'session_status',
            'schedule_id.id', 'schedule_id.start_time', 'schedule_id.end_time', 'schedule_id.room',
            'schedule_id.max_capacity',
            'schedule_id.class_id.id', 'schedule_id.class_id.name', 'schedule_id.class_id.description',
            'schedule_id.class_id.category', 'schedule_id.class_id.difficulty_level',
            'schedule_id.class_id.duration_minutes', 'schedule_id.class_id.max_capacity',
            'schedule_id.instructor_id.id', 'schedule_id.instructor_id.full_name',
            'schedule_id.branch_id.id', 'schedule_id.branch_id.name',
          ],
        });

        if (!session) {
          throw NotFoundError('Session not found');
        }

        // Transform data
        const transformed = {
          id: session.id,
          session_date: session.session_date,
          current_count: session.current_count,
          waitlist_count: session.waitlist_count,
          session_status: session.session_status,
          schedule: session.schedule_id ? {
            id: session.schedule_id.id,
            start_time: session.schedule_id.start_time,
            end_time: session.schedule_id.end_time,
            room: session.schedule_id.room,
            max_capacity: session.schedule_id.max_capacity,
            class: session.schedule_id.class_id,
            instructor: session.schedule_id.instructor_id,
            branch: session.schedule_id.branch_id,
          } : null,
          class: session.schedule_id?.class_id,
          instructor: session.schedule_id?.instructor_id,
          branch: session.schedule_id?.branch_id,
        };

        res.json({
          success: true,
          data: transformed,
        });
      } catch (error) {
        console.error('[GymEndpoint] Get session error:', error);
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
        const { status, upcoming } = req.query;

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

        // Transform for frontend compatibility
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

        // Filter upcoming if requested
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

        // TODO: Add admin authentication check

        // Call atomic attend function
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

    // ============================================
    // 4. Push Notification Endpoints
    // ============================================

    /**
     * GET /gym/push/vapid-public-key
     * Get VAPID public key for push subscription
     */
    router.get('/push/vapid-public-key', (req, res) => {
      const publicKey = env.VAPID_PUBLIC_KEY;

      if (!publicKey) {
        res.status(500).json({
          success: false,
          message: 'VAPID public key not configured',
        });
        return;
      }

      res.json({
        success: true,
        publicKey,
      });
    });

    /**
     * POST /gym/push/subscribe
     * Subscribe to push notifications
     */
    router.post('/push/subscribe', memberAuthMiddleware, async (req, res) => {
      try {
        const { endpoint, keys, preferences = {} } = req.body || {};
        const memberId = req.member.id;

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
          throw InvalidPayloadError('endpoint and keys are required');
        }

        const deviceName = req.body.device_name || null;
        const userAgent = req.headers['user-agent'] || null;

        // Call subscription function
        const result = await database.raw(`
          SELECT subscribe_push(
            ?::text, ?::varchar, ?::varchar,
            ?::uuid, NULL::uuid, NULL::uuid,
            ?::varchar, ?::text,
            ?::jsonb
          ) as subscription_id
        `, [
          endpoint, keys.p256dh, keys.auth,
          memberId,
          deviceName, userAgent,
          JSON.stringify(preferences),
        ]);

        const row = result.rows?.[0] || result[0];

        console.log(`[GymEndpoint] Push subscription created for member ${memberId}`);

        res.json({
          success: true,
          subscription_id: row?.subscription_id,
        });
      } catch (error) {
        console.error('[GymEndpoint] Push subscribe error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * DELETE /gym/push/unsubscribe
     * Unsubscribe from push notifications
     */
    router.delete('/push/unsubscribe', async (req, res) => {
      try {
        const { endpoint } = req.body || {};

        if (!endpoint) {
          throw InvalidPayloadError('endpoint is required');
        }

        const result = await database.raw(`
          SELECT unsubscribe_push(?::text) as success
        `, [endpoint]);

        const row = result.rows?.[0] || result[0];

        console.log(`[GymEndpoint] Push unsubscribed: ${endpoint}`);

        res.json({
          success: row?.success || false,
        });
      } catch (error) {
        console.error('[GymEndpoint] Push unsubscribe error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * PATCH /gym/push/preferences
     * Update push notification preferences
     */
    router.patch('/push/preferences', memberAuthMiddleware, async (req, res) => {
      try {
        const { endpoint, preferences } = req.body || {};

        if (!endpoint || !preferences) {
          throw InvalidPayloadError('endpoint and preferences are required');
        }

        const schema = await getSchema();
        const subscriptionsService = new ItemsService('push_subscriptions', {
          schema,
          knex: database,
        });

        const subs = await subscriptionsService.readByQuery({
          filter: {
            endpoint: { _eq: endpoint },
            member_id: { _eq: req.member.id },
          },
          limit: 1,
        });

        if (subs.length === 0) {
          throw NotFoundError('Subscription not found');
        }

        await subscriptionsService.updateOne(subs[0].id, {
          notify_booking_reminder: preferences.notify_booking_reminder ?? subs[0].notify_booking_reminder,
          notify_contract_expiry: preferences.notify_contract_expiry ?? subs[0].notify_contract_expiry,
          notify_class_cancelled: preferences.notify_class_cancelled ?? subs[0].notify_class_cancelled,
          notify_promotions: preferences.notify_promotions ?? subs[0].notify_promotions,
        });

        console.log(`[GymEndpoint] Push preferences updated for member ${req.member.id}`);

        res.json({
          success: true,
        });
      } catch (error) {
        console.error('[GymEndpoint] Update preferences error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    // ============================================
    // 5. Member Profile Endpoint
    // ============================================

    /**
     * GET /gym/member/me
     * Get current member profile
     */
    router.get('/member/me', memberAuthMiddleware, async (req, res) => {
      try {
        const memberId = req.member.id;

        const schema = await getSchema();
        const membersService = new ItemsService('members', {
          schema,
          knex: database,
        });

        const member = await membersService.readOne(memberId, {
          fields: [
            'id', 'member_code', 'full_name', 'phone', 'email',
            'gender', 'birthday', 'address',
            'member_status', 'join_date',
            'branch_id.id', 'branch_id.name',
          ],
        });

        if (!member) {
          throw NotFoundError('Member not found');
        }

        // Get active contracts
        const contractsService = new ItemsService('contracts', {
          schema,
          knex: database,
        });

        const today = new Date().toISOString().split('T')[0];
        const contracts = await contractsService.readByQuery({
          filter: {
            _and: [
              { member_id: { _eq: memberId } },
              { contract_status: { _in: ['ACTIVE', 'PAUSED'] } },
              { status: { _eq: 'active' } },
            ],
          },
          fields: [
            'id', 'contract_no', 'contract_status', 'start_date', 'end_date',
            'remaining_counts', 'payment_status',
            'plan_id.id', 'plan_id.name', 'plan_id.plan_type',
          ],
          sort: ['-start_date'],
        });

        res.json({
          success: true,
          data: {
            ...member,
            contracts,
          },
        });
      } catch (error) {
        console.error('[GymEndpoint] Get member profile error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * POST /gym/member/complete-profile
     * Complete member profile after social login
     * Uses Directus session cookie for authentication
     */
    router.post('/member/complete-profile', async (req, res) => {
      try {
        const { full_name, phone, gender, birthday, branch_id, emergency_contact, emergency_phone } = req.body || {};

        // Validate required fields
        if (!full_name || !full_name.trim()) {
          throw InvalidPayloadError('請輸入您的姓名');
        }

        if (!phone || !phone.trim()) {
          throw InvalidPayloadError('請輸入您的手機號碼');
        }

        // Validate phone format (Taiwan mobile)
        const cleanPhone = phone.replace(/[-\s]/g, '');
        if (!/^09\d{8}$/.test(cleanPhone)) {
          throw InvalidPayloadError('請輸入有效的手機號碼（09開頭，10位數字）');
        }

        // Validate gender if provided
        if (gender && !['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
          throw InvalidPayloadError('性別格式不正確');
        }

        // Get current user from Directus session
        // Try to get accountability from request (set by Directus auth)
        let userId = req.accountability?.user;

        // If no accountability, try to get from session cookie
        if (!userId) {
          // Try to read session from cookies and validate
          const sessionToken = req.cookies?.directus_session_token;
          if (sessionToken) {
            try {
              const sessionResult = await database('directus_sessions')
                .where({ token: sessionToken })
                .whereRaw('expires > NOW()')
                .first();

              if (sessionResult) {
                userId = sessionResult.user;
              }
            } catch (e) {
              console.error('[GymEndpoint] Session lookup error:', e);
            }
          }
        }

        if (!userId) {
          throw UnauthorizedError('請先登入');
        }

        // Find member by user_id
        const schema = await getSchema();
        const membersService = new ItemsService('members', {
          schema,
          knex: database,
        });

        const members = await membersService.readByQuery({
          filter: {
            user_id: { _eq: userId },
            status: { _eq: 'active' },
          },
          limit: 1,
        });

        if (!members || members.length === 0) {
          throw NotFoundError('找不到會員資料，請聯繫客服');
        }

        const member = members[0];

        // Prepare update data
        const updateData = {
          full_name: full_name.trim(),
          phone: cleanPhone,
        };

        // Add optional fields if provided
        if (gender) {
          updateData.gender = gender;
        }
        if (birthday) {
          updateData.birthday = birthday;
        }
        if (branch_id) {
          updateData.branch_id = branch_id;
        }
        if (emergency_contact && emergency_contact.trim()) {
          updateData.emergency_contact = emergency_contact.trim();
        }
        if (emergency_phone && emergency_phone.trim()) {
          updateData.emergency_phone = emergency_phone.replace(/[-\s]/g, '');
        }

        // Update member
        await membersService.updateOne(member.id, updateData);

        // Fetch updated member
        const updatedMember = await membersService.readOne(member.id, {
          fields: [
            'id', 'member_code', 'full_name', 'phone', 'email',
            'gender', 'birthday', 'address',
            'member_status', 'join_date',
            'branch_id.id', 'branch_id.name',
          ],
        });

        res.json({
          success: true,
          message: '資料已更新',
          member: updatedMember,
        });
      } catch (error) {
        console.error('[GymEndpoint] Complete profile error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    // ============================================
    // 6. Contract Pause/Resume Endpoints
    // ============================================

    /**
     * POST /gym/contracts/:id/pause
     * Request to pause a contract
     */
    router.post('/contracts/:id/pause', memberAuthMiddleware, async (req, res) => {
      try {
        const contractId = req.params.id;
        const { reason } = req.body || {};
        const memberId = req.member.id;

        if (!reason || reason.trim().length < 5) {
          throw InvalidPayloadError('請提供暫停原因（至少 5 個字）');
        }

        const schema = await getSchema();
        const contractsService = new ItemsService('contracts', {
          schema,
          knex: database,
        });

        // Verify contract belongs to member and is active
        const contract = await contractsService.readOne(contractId, {
          fields: ['id', 'member_id', 'contract_status', 'end_date', 'contract_no'],
        });

        if (!contract) {
          throw NotFoundError('合約不存在');
        }

        if (contract.member_id !== memberId) {
          throw ForbiddenError('無權操作此合約');
        }

        if (contract.contract_status !== 'ACTIVE') {
          throw InvalidPayloadError(`合約狀態為 ${contract.contract_status}，無法暫停`);
        }

        const today = new Date().toISOString().split('T')[0];

        // Create contract log for pause
        const logsService = new ItemsService('contract_logs', {
          schema,
          knex: database,
        });

        await logsService.createOne({
          contract_id: contractId,
          log_type: 'PAUSE',
          start_date: today,
          reason: reason.trim(),
          branch_id: req.member.branch_id,
        });

        // Update contract status
        await contractsService.updateOne(contractId, {
          contract_status: 'PAUSED',
        });

        console.log(`[GymEndpoint] Contract ${contract.contract_no} paused by member ${memberId}`);

        res.json({
          success: true,
          message: '合約已暫停',
          contract_no: contract.contract_no,
        });
      } catch (error) {
        console.error('[GymEndpoint] Contract pause error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * POST /gym/contracts/:id/resume
     * Request to resume a paused contract
     */
    router.post('/contracts/:id/resume', memberAuthMiddleware, async (req, res) => {
      try {
        const contractId = req.params.id;
        const memberId = req.member.id;

        const schema = await getSchema();
        const contractsService = new ItemsService('contracts', {
          schema,
          knex: database,
        });

        // Verify contract belongs to member and is paused
        const contract = await contractsService.readOne(contractId, {
          fields: ['id', 'member_id', 'contract_status', 'end_date', 'contract_no'],
        });

        if (!contract) {
          throw NotFoundError('合約不存在');
        }

        if (contract.member_id !== memberId) {
          throw ForbiddenError('無權操作此合約');
        }

        if (contract.contract_status !== 'PAUSED') {
          throw InvalidPayloadError(`合約狀態為 ${contract.contract_status}，無法恢復`);
        }

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        // Find the pause log to calculate days
        const logsService = new ItemsService('contract_logs', {
          schema,
          knex: database,
        });

        const pauseLogs = await logsService.readByQuery({
          filter: {
            _and: [
              { contract_id: { _eq: contractId } },
              { log_type: { _eq: 'PAUSE' } },
              { end_date: { _null: true } },
            ],
          },
          sort: ['-date_created'],
          limit: 1,
        });

        let daysAffected = 0;
        if (pauseLogs.length > 0) {
          const pauseLog = pauseLogs[0];
          const pauseStart = new Date(pauseLog.start_date);
          daysAffected = Math.ceil((today - pauseStart) / (1000 * 60 * 60 * 24));

          // Update the pause log with end date and days affected
          await logsService.updateOne(pauseLog.id, {
            end_date: todayStr,
            days_affected: daysAffected,
          });
        }

        // Extend contract end_date by days paused
        let newEndDate = contract.end_date;
        if (contract.end_date && daysAffected > 0) {
          const endDate = new Date(contract.end_date);
          endDate.setDate(endDate.getDate() + daysAffected);
          newEndDate = endDate.toISOString().split('T')[0];
        }

        // Update contract status and end_date
        await contractsService.updateOne(contractId, {
          contract_status: 'ACTIVE',
          end_date: newEndDate,
        });

        console.log(`[GymEndpoint] Contract ${contract.contract_no} resumed by member ${memberId}, extended by ${daysAffected} days`);

        res.json({
          success: true,
          message: `合約已恢復${daysAffected > 0 ? `，到期日順延 ${daysAffected} 天` : ''}`,
          contract_no: contract.contract_no,
          new_end_date: newEndDate,
          days_extended: daysAffected,
        });
      } catch (error) {
        console.error('[GymEndpoint] Contract resume error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    // ============================================
    // 7. Reports Endpoints (報表API)
    // ============================================

    /**
     * GET /gym/reports/revenue
     * 營收報表 - 按日期和分店統計營收
     * Query params: start_date, end_date, branch_id (optional)
     */
    router.get('/reports/revenue', async (req, res) => {
      try {
        const { start_date, end_date, branch_id } = req.query;

        // Default to last 30 days if not specified
        const endDate = end_date || new Date().toISOString().split('T')[0];
        const startDate = start_date || (() => {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          return d.toISOString().split('T')[0];
        })();

        // Build query with optional branch filter
        let query = `
          SELECT
            payment_day,
            branch_id,
            branch_name,
            transaction_count,
            total_income,
            total_refund,
            net_revenue,
            unique_members,
            cash_income,
            credit_card_income,
            bank_transfer_income,
            line_pay_income
          FROM revenue_daily_summary
          WHERE payment_day BETWEEN ?::date AND ?::date
        `;

        const params = [startDate, endDate];

        if (branch_id) {
          query += ` AND branch_id = ?::uuid`;
          params.push(branch_id);
        }

        query += ` ORDER BY payment_day DESC`;

        const result = await database.raw(query, params);
        const rows = result.rows || result;

        // Calculate totals
        const totals = rows.reduce((acc, row) => ({
          total_income: (acc.total_income || 0) + parseFloat(row.total_income || 0),
          total_refund: (acc.total_refund || 0) + parseFloat(row.total_refund || 0),
          net_revenue: (acc.net_revenue || 0) + parseFloat(row.net_revenue || 0),
          transaction_count: (acc.transaction_count || 0) + parseInt(row.transaction_count || 0),
        }), {});

        res.json({
          success: true,
          period: { start_date: startDate, end_date: endDate },
          summary: {
            total_income: totals.total_income || 0,
            total_refund: totals.total_refund || 0,
            net_revenue: totals.net_revenue || 0,
            total_transactions: totals.transaction_count || 0,
            average_daily_revenue: rows.length > 0 ? (totals.net_revenue / rows.length).toFixed(2) : 0,
          },
          data: rows,
        });
      } catch (error) {
        console.error('[GymEndpoint] Revenue report error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * GET /gym/reports/member-growth
     * 會員成長報表 - 統計新增會員趨勢
     * Query params: start_date, end_date, branch_id (optional)
     */
    router.get('/reports/member-growth', async (req, res) => {
      try {
        const { start_date, end_date, branch_id } = req.query;

        // Default to last 30 days
        const endDate = end_date || new Date().toISOString().split('T')[0];
        const startDate = start_date || (() => {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          return d.toISOString().split('T')[0];
        })();

        let query = `
          SELECT
            join_day,
            branch_id,
            branch_name,
            new_members,
            active_members,
            male_count,
            female_count,
            sales_persons_involved
          FROM member_growth_summary
          WHERE join_day BETWEEN ?::date AND ?::date
        `;

        const params = [startDate, endDate];

        if (branch_id) {
          query += ` AND branch_id = ?::uuid`;
          params.push(branch_id);
        }

        query += ` ORDER BY join_day DESC`;

        const result = await database.raw(query, params);
        const rows = result.rows || result;

        // Calculate totals
        const totals = rows.reduce((acc, row) => ({
          total_new_members: (acc.total_new_members || 0) + parseInt(row.new_members || 0),
          total_male: (acc.total_male || 0) + parseInt(row.male_count || 0),
          total_female: (acc.total_female || 0) + parseInt(row.female_count || 0),
        }), {});

        // Get current total members count
        const totalMembersResult = await database.raw(`
          SELECT COUNT(*) as count
          FROM members
          WHERE status = 'active'
          ${branch_id ? `AND branch_id = ?::uuid` : ''}
        `, branch_id ? [branch_id] : []);

        const totalMembers = parseInt((totalMembersResult.rows?.[0] || totalMembersResult[0])?.count || 0);

        res.json({
          success: true,
          period: { start_date: startDate, end_date: endDate },
          summary: {
            total_new_members: totals.total_new_members || 0,
            total_members: totalMembers,
            average_daily_growth: rows.length > 0 ? (totals.total_new_members / rows.length).toFixed(2) : 0,
            gender_distribution: {
              male: totals.total_male || 0,
              female: totals.total_female || 0,
            },
          },
          data: rows,
        });
      } catch (error) {
        console.error('[GymEndpoint] Member growth report error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * GET /gym/reports/contract-expiry
     * 合約到期提醒報表 - 列出即將到期的合約
     * Query params: days_ahead (default: 30), branch_id (optional), limit (default: 100)
     */
    router.get('/reports/contract-expiry', async (req, res) => {
      try {
        const { days_ahead = 30, branch_id, limit = 100 } = req.query;

        let query = `
          SELECT
            contract_id,
            contract_no,
            member_id,
            member_name,
            member_code,
            member_phone,
            member_email,
            branch_id,
            branch_name,
            plan_name,
            start_date,
            end_date,
            contract_status,
            payment_status,
            days_until_expiry,
            sales_person_id,
            sales_person_name,
            total_amount,
            total_paid,
            outstanding_amount
          FROM contract_expiry_alerts
          WHERE days_until_expiry <= ?::integer
        `;

        const params = [parseInt(days_ahead)];

        if (branch_id) {
          query += ` AND branch_id = ?::uuid`;
          params.push(branch_id);
        }

        query += ` ORDER BY days_until_expiry ASC LIMIT ?::integer`;
        params.push(parseInt(limit));

        const result = await database.raw(query, params);
        const rows = result.rows || result;

        // Group by expiry urgency
        const groupedData = {
          urgent: rows.filter(r => r.days_until_expiry <= 7),
          soon: rows.filter(r => r.days_until_expiry > 7 && r.days_until_expiry <= 30),
          upcoming: rows.filter(r => r.days_until_expiry > 30),
        };

        res.json({
          success: true,
          summary: {
            total_expiring: rows.length,
            urgent_count: groupedData.urgent.length,
            soon_count: groupedData.soon.length,
            upcoming_count: groupedData.upcoming.length,
          },
          grouped: groupedData,
          data: rows,
        });
      } catch (error) {
        console.error('[GymEndpoint] Contract expiry report error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * GET /gym/reports/member-activity
     * 會員活躍度報表 - 基於 check-in 統計
     * Query params: start_date, end_date, branch_id (optional)
     */
    router.get('/reports/member-activity', async (req, res) => {
      try {
        const { start_date, end_date, branch_id } = req.query;

        // Default to last 30 days
        const endDate = end_date || new Date().toISOString().split('T')[0];
        const startDate = start_date || (() => {
          const d = new Date();
          d.setDate(d.getDate() - 30);
          return d.toISOString().split('T')[0];
        })();

        let query = `
          SELECT
            activity_day,
            branch_id,
            branch_name,
            total_check_ins,
            unique_members,
            qr_code_count,
            manual_count,
            card_count,
            morning_count,
            afternoon_count,
            evening_count
          FROM member_activity_summary
          WHERE activity_day BETWEEN ?::date AND ?::date
        `;

        const params = [startDate, endDate];

        if (branch_id) {
          query += ` AND branch_id = ?::uuid`;
          params.push(branch_id);
        }

        query += ` ORDER BY activity_day DESC`;

        const result = await database.raw(query, params);
        const rows = result.rows || result;

        // Calculate totals
        const totals = rows.reduce((acc, row) => ({
          total_check_ins: (acc.total_check_ins || 0) + parseInt(row.total_check_ins || 0),
          total_unique_members: (acc.total_unique_members || 0) + parseInt(row.unique_members || 0),
          qr_code_total: (acc.qr_code_total || 0) + parseInt(row.qr_code_count || 0),
          manual_total: (acc.manual_total || 0) + parseInt(row.manual_count || 0),
          card_total: (acc.card_total || 0) + parseInt(row.card_count || 0),
        }), {});

        res.json({
          success: true,
          period: { start_date: startDate, end_date: endDate },
          summary: {
            total_check_ins: totals.total_check_ins || 0,
            average_daily_check_ins: rows.length > 0 ? (totals.total_check_ins / rows.length).toFixed(2) : 0,
            method_distribution: {
              qr_code: totals.qr_code_total || 0,
              manual: totals.manual_total || 0,
              card: totals.card_total || 0,
            },
          },
          data: rows,
        });
      } catch (error) {
        console.error('[GymEndpoint] Member activity report error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * POST /gym/reports/refresh
     * 刷新報表物化視圖 (admin only)
     */
    router.post('/reports/refresh', async (req, res) => {
      try {
        // TODO: Add admin authentication check

        await database.raw('SELECT refresh_report_views()');

        console.log('[GymEndpoint] Report views refreshed');

        res.json({
          success: true,
          message: '報表資料已更新',
          refreshed_at: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[GymEndpoint] Refresh reports error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    console.log('[GymEndpoint] Gym API endpoints registered');
  },
};
