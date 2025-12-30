/**
 * Gym Custom API Endpoints
 *
 * 1. OTP Authentication - Send/Verify OTP for member login
 * 2. QR Code Checkin - Verify QR code and process member check-in
 * 3. Class Bookings - Book/cancel classes with atomic operations
 * 4. Push Notifications - VAPID key and subscription management
 * 5. Reports - 報表查詢和刷新
 * 6. Member Profile - 會員資料管理
 * 7. Contracts - 合約暫停/恢復
 * 8. Notification Preferences - 通知偏好設定 (LINE/Push/Email/SMS)
 */

import crypto from 'crypto';

// ============================================
// Redis 緩存工具 (可選 - 報表緩存)
// ============================================
let redisClient = null;
let redisAvailable = false;

// 嘗試連接 Redis
async function initRedis() {
  try {
    const Redis = (await import('ioredis')).default;
    const host = process.env.REDIS_HOST || 'redis';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);

    redisClient = new Redis({
      host,
      port,
      retryStrategy: (times) => times > 2 ? null : Math.min(times * 100, 1000),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    redisClient.on('connect', () => {
      redisAvailable = true;
      console.log('[GymEndpoint] Redis connected for report caching');
    });

    redisClient.on('error', () => {
      redisAvailable = false;
    });

    await redisClient.connect();
  } catch (error) {
    console.log('[GymEndpoint] Redis not available, reports will not be cached');
  }
}

// 初始化 Redis 連接（非阻塞）
initRedis();

// 報表緩存函數
const REPORT_CACHE_TTL = 600; // 10 分鐘
const CACHE_PREFIX = 'gym:report:';

async function getCachedReport(reportType, queryKey) {
  if (!redisAvailable || !redisClient) return null;
  try {
    const key = `${CACHE_PREFIX}${reportType}:${queryKey}`;
    const data = await redisClient.get(key);
    if (data) {
      console.log(`[GymEndpoint] Cache HIT: ${reportType}`);
      return JSON.parse(data);
    }
    console.log(`[GymEndpoint] Cache MISS: ${reportType}`);
    return null;
  } catch (error) {
    return null;
  }
}

async function setCachedReport(reportType, queryKey, data) {
  if (!redisAvailable || !redisClient) return;
  try {
    const key = `${CACHE_PREFIX}${reportType}:${queryKey}`;
    await redisClient.setex(key, REPORT_CACHE_TTL, JSON.stringify(data));
    console.log(`[GymEndpoint] Cache SET: ${reportType}`);
  } catch (error) {
    // 忽略緩存錯誤
  }
}

async function invalidateReportCache() {
  if (!redisAvailable || !redisClient) return;
  try {
    const keys = await redisClient.keys(`${CACHE_PREFIX}*`);
    if (keys.length > 0) {
      await redisClient.del(...keys);
      console.log(`[GymEndpoint] Invalidated ${keys.length} report cache entries`);
    }
  } catch (error) {
    console.log('[GymEndpoint] Error invalidating cache:', error.message);
  }
}

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
        // Use custom header 'X-Member-Token' to avoid Directus intercepting Authorization header
        // Also check Authorization header for backwards compatibility with direct API calls
        const memberToken = req.headers['x-member-token'];
        const authHeader = req.headers.authorization;
        const token = memberToken || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null);

        if (!token) {
          throw UnauthorizedError('Authentication required');
        }

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

        // 嘗試從緩存獲取
        const cacheKey = `${startDate}_${endDate}_${branch_id || 'all'}`;
        const cached = await getCachedReport('revenue', cacheKey);
        if (cached) {
          return res.json(cached);
        }

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

        const response = {
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
        };

        // 緩存響應
        await setCachedReport('revenue', cacheKey, response);

        res.json(response);
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

        // 嘗試從緩存獲取
        const cacheKey = `${startDate}_${endDate}_${branch_id || 'all'}`;
        const cached = await getCachedReport('member-growth', cacheKey);
        if (cached) {
          return res.json(cached);
        }

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

        const response = {
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
        };

        // 緩存響應
        await setCachedReport('member-growth', cacheKey, response);

        res.json(response);
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

        // 嘗試從緩存獲取 (合約到期提醒用較短的 TTL)
        const cacheKey = `${days_ahead}_${branch_id || 'all'}_${limit}`;
        const cached = await getCachedReport('contract-expiry', cacheKey);
        if (cached) {
          return res.json(cached);
        }

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

        const response = {
          success: true,
          summary: {
            total_expiring: rows.length,
            urgent_count: groupedData.urgent.length,
            soon_count: groupedData.soon.length,
            upcoming_count: groupedData.upcoming.length,
          },
          grouped: groupedData,
          data: rows,
        };

        // 緩存響應 (合約到期提醒緩存 5 分鐘)
        await setCachedReport('contract-expiry', cacheKey, response);

        res.json(response);
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

        // 嘗試從緩存獲取
        const cacheKey = `${startDate}_${endDate}_${branch_id || 'all'}`;
        const cached = await getCachedReport('member-activity', cacheKey);
        if (cached) {
          return res.json(cached);
        }

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

        const response = {
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
        };

        // 緩存響應
        await setCachedReport('member-activity', cacheKey, response);

        res.json(response);
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
        // 驗證用戶身份
        const userId = req.accountability?.user;
        if (!userId) {
          return res.status(401).json({
            success: false,
            message: '請先登入',
          });
        }

        // 檢查是否為 Directus 管理員
        const isDirectusAdmin = req.accountability?.admin === true;

        // 如果不是 Directus 管理員，檢查自定義權限
        if (!isDirectusAdmin) {
          const permissionResult = await database.raw(`
            SELECT
              COALESCE(e.custom_permissions, jt.permissions_config) as permissions
            FROM employees e
            LEFT JOIN job_titles jt ON jt.id = e.job_title_id
            WHERE e.user_id = $1
              AND e.status = 'active'
            LIMIT 1
          `, [userId]);

          const employee = permissionResult.rows?.[0];
          const permissions = employee?.permissions || {};

          // 檢查是否有 reports.manage 權限
          const hasReportManagePermission = permissions?.reports?.manage === true;

          if (!hasReportManagePermission) {
            console.log(`[GymEndpoint] Reports refresh denied for user ${userId}: no reports.manage permission`);
            return res.status(403).json({
              success: false,
              message: '權限不足：您沒有權限刷新報表資料',
            });
          }
        }

        console.log(`[GymEndpoint] Reports refresh authorized for user ${userId} (admin: ${isDirectusAdmin})`);

        await database.raw('SELECT refresh_report_views()');

        // 清除報表緩存
        await invalidateReportCache();

        console.log('[GymEndpoint] Report views refreshed and cache cleared');

        res.json({
          success: true,
          message: '報表資料已更新',
          refreshed_at: new Date().toISOString(),
          cache_cleared: true,
        });
      } catch (error) {
        console.error('[GymEndpoint] Refresh reports error:', error);
        res.status(error.status || 500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    // ============================================
    // 8. Notification Preferences Endpoints
    // ============================================

    /**
     * GET /gym/notifications/preferences
     * Get member's notification preferences and available channels
     */
    router.get('/notifications/preferences', memberAuthMiddleware, async (req, res) => {
      try {
        const memberId = req.member.id;

        // Get or create preferences
        let prefsResult = await database.raw(`
          SELECT * FROM member_notification_preferences
          WHERE member_id = ?::uuid
        `, [memberId]);

        let preferences = prefsResult.rows?.[0];

        // Create default preferences if not exists
        if (!preferences) {
          await database.raw(`
            INSERT INTO member_notification_preferences (member_id)
            VALUES (?::uuid)
            ON CONFLICT (member_id) DO NOTHING
          `, [memberId]);

          prefsResult = await database.raw(`
            SELECT * FROM member_notification_preferences
            WHERE member_id = ?::uuid
          `, [memberId]);
          preferences = prefsResult.rows?.[0];
        }

        // Check channel availability
        const channelsResult = await database.raw(`
          SELECT
            EXISTS(SELECT 1 FROM member_social_accounts
                   WHERE member_id = ?::uuid AND provider = 'line' AND status = 'active') as has_line,
            EXISTS(SELECT 1 FROM push_subscriptions
                   WHERE member_id = ?::uuid AND status = 'active' AND error_count < 5) as has_push,
            (SELECT email IS NOT NULL AND email != '' FROM members WHERE id = ?::uuid) as has_email,
            (SELECT phone IS NOT NULL AND phone != '' FROM members WHERE id = ?::uuid) as has_phone
        `, [memberId, memberId, memberId, memberId]);

        const channels = channelsResult.rows?.[0] || {};

        res.json({
          success: true,
          preferences: {
            // Channel toggles
            enable_line: preferences?.enable_line ?? true,
            enable_push: preferences?.enable_push ?? true,
            enable_email: preferences?.enable_email ?? true,
            enable_sms: preferences?.enable_sms ?? false,
            // Notification types
            notify_booking_confirmation: preferences?.notify_booking_confirmation ?? true,
            notify_booking_reminder: preferences?.notify_booking_reminder ?? true,
            notify_booking_cancelled: preferences?.notify_booking_cancelled ?? true,
            notify_contract_expiry: preferences?.notify_contract_expiry ?? true,
            notify_payment_confirmation: preferences?.notify_payment_confirmation ?? true,
            notify_promotions: preferences?.notify_promotions ?? false,
            notify_system: preferences?.notify_system ?? true,
            // Quiet hours
            quiet_hours_enabled: preferences?.quiet_hours_enabled ?? false,
            quiet_hours_start: preferences?.quiet_hours_start ?? '22:00',
            quiet_hours_end: preferences?.quiet_hours_end ?? '08:00',
            // SMS settings
            sms_fallback_enabled: preferences?.sms_fallback_enabled ?? false,
            sms_otp_only: preferences?.sms_otp_only ?? true,
          },
          available_channels: {
            line: channels.has_line || false,
            push: channels.has_push || false,
            email: channels.has_email || false,
            sms: channels.has_phone || false,
          },
        });
      } catch (error) {
        console.error('[GymEndpoint] Get notification preferences error:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * PATCH /gym/notifications/preferences
     * Update member's notification preferences
     */
    router.patch('/notifications/preferences', memberAuthMiddleware, async (req, res) => {
      try {
        const memberId = req.member.id;
        const updates = req.body || {};

        // Allowed fields for update
        const allowedFields = [
          'enable_line', 'enable_push', 'enable_email', 'enable_sms',
          'notify_booking_confirmation', 'notify_booking_reminder', 'notify_booking_cancelled',
          'notify_contract_expiry', 'notify_payment_confirmation', 'notify_promotions', 'notify_system',
          'quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end',
          'sms_fallback_enabled', 'sms_otp_only',
        ];

        // Filter valid updates
        const validUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
          if (allowedFields.includes(key)) {
            validUpdates[key] = value;
          }
        }

        if (Object.keys(validUpdates).length === 0) {
          return res.status(400).json({
            success: false,
            message: '沒有有效的欄位可更新',
          });
        }

        // Ensure preferences record exists
        await database.raw(`
          INSERT INTO member_notification_preferences (member_id)
          VALUES (?::uuid)
          ON CONFLICT (member_id) DO NOTHING
        `, [memberId]);

        // Build dynamic UPDATE
        const setClauses = Object.keys(validUpdates).map((key, i) => `${key} = $${i + 2}`);
        const values = [memberId, ...Object.values(validUpdates)];

        await database.raw(`
          UPDATE member_notification_preferences
          SET ${setClauses.join(', ')}, date_updated = NOW()
          WHERE member_id = $1::uuid
        `, values);

        // Fetch updated preferences
        const result = await database.raw(`
          SELECT * FROM member_notification_preferences
          WHERE member_id = ?::uuid
        `, [memberId]);

        res.json({
          success: true,
          message: '通知設定已更新',
          preferences: result.rows?.[0],
        });
      } catch (error) {
        console.error('[GymEndpoint] Update notification preferences error:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * GET /gym/notifications/history
     * Get member's notification history
     */
    router.get('/notifications/history', memberAuthMiddleware, async (req, res) => {
      try {
        const memberId = req.member.id;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = parseInt(req.query.offset) || 0;

        const result = await database.raw(`
          SELECT
            id, notification_type, title, body,
            successful_channel, overall_status, sent_at,
            reference_type, reference_id, date_created
          FROM notification_logs
          WHERE member_id = ?::uuid
          ORDER BY date_created DESC
          LIMIT ?::integer OFFSET ?::integer
        `, [memberId, limit, offset]);

        // Get total count
        const countResult = await database.raw(`
          SELECT COUNT(*) as total FROM notification_logs WHERE member_id = ?::uuid
        `, [memberId]);

        res.json({
          success: true,
          data: result.rows || [],
          pagination: {
            limit,
            offset,
            total: parseInt(countResult.rows?.[0]?.total || 0),
          },
        });
      } catch (error) {
        console.error('[GymEndpoint] Get notification history error:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * GET /gym/notifications/channels
     * Get available notification channels status
     */
    router.get('/notifications/channels', memberAuthMiddleware, async (req, res) => {
      try {
        const memberId = req.member.id;

        // Get detailed channel info
        const result = await database.raw(`
          SELECT
            m.email,
            m.phone,
            msa.provider_user_id as line_user_id,
            msa.provider_name as line_display_name,
            msa.linked_at as line_linked_at,
            ps.id as push_subscription_id,
            ps.device_name as push_device_name,
            ps.date_created as push_subscribed_at
          FROM members m
          LEFT JOIN member_social_accounts msa
            ON msa.member_id = m.id AND msa.provider = 'line' AND msa.status = 'active'
          LEFT JOIN push_subscriptions ps
            ON ps.member_id = m.id AND ps.status = 'active' AND ps.error_count < 5
          WHERE m.id = ?::uuid
        `, [memberId]);

        const row = result.rows?.[0] || {};

        res.json({
          success: true,
          channels: {
            line: {
              available: !!row.line_user_id,
              displayName: row.line_display_name,
              linkedAt: row.line_linked_at,
            },
            push: {
              available: !!row.push_subscription_id,
              deviceName: row.push_device_name,
              subscribedAt: row.push_subscribed_at,
            },
            email: {
              available: !!row.email,
              address: row.email ? row.email.replace(/(.{2}).*(@.*)/, '$1***$2') : null, // Mask email
            },
            sms: {
              available: !!row.phone,
              phone: row.phone ? row.phone.replace(/(\d{4}).*(\d{3})/, '$1****$2') : null, // Mask phone
            },
          },
        });
      } catch (error) {
        console.error('[GymEndpoint] Get notification channels error:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * POST /gym/notifications/test
     * Send a test notification (development only)
     */
    router.post('/notifications/test', memberAuthMiddleware, async (req, res) => {
      // Only allow in development
      if (env.NODE_ENV === 'production') {
        return res.status(403).json({
          success: false,
          message: '測試功能僅在開發環境可用',
        });
      }

      try {
        const memberId = req.member.id;
        const { channel, type = 'test' } = req.body || {};

        // Dynamic import notification service
        let notificationService;
        try {
          notificationService = await import('../../../directus-extension-gym-hooks/src/notification-service.js');
        } catch (e) {
          return res.status(500).json({
            success: false,
            message: 'NotificationService not available',
          });
        }

        if (!notificationService.isInitialized()) {
          return res.status(500).json({
            success: false,
            message: 'NotificationService not initialized',
          });
        }

        const result = await notificationService.sendNotification({
          memberId,
          type,
          data: {
            message: '這是一則測試通知',
            memberName: req.member.full_name || req.member.member_code,
          },
          forcedChannels: channel ? [channel] : undefined,
        });

        res.json({
          success: result.success,
          channel: result.channel,
          attempts: result.attempts,
          error: result.error,
        });
      } catch (error) {
        console.error('[GymEndpoint] Test notification error:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    // ============================================
    // 9. Branch Notification Config (Admin)
    // ============================================

    /**
     * Admin authentication middleware
     * Requires Directus admin or branch manager with notification_config permission
     */
    const adminNotificationMiddleware = async (req, res, next) => {
      try {
        const userId = req.accountability?.user;
        if (!userId) {
          return res.status(401).json({ success: false, message: '請先登入' });
        }

        // Directus admin has full access
        if (req.accountability?.admin === true) {
          req.adminBranchId = null; // null means all branches
          return next();
        }

        // Check if user is employee with notification config permission
        const empResult = await database.raw(`
          SELECT
            e.id,
            e.branch_id,
            jt.permissions_config,
            e.custom_permissions
          FROM employees e
          JOIN job_titles jt ON e.job_title_id = jt.id
          WHERE e.user_id = ?::uuid AND e.status = 'active'
        `, [userId]);

        if (empResult.rows?.length === 0) {
          return res.status(403).json({ success: false, message: '無權限' });
        }

        const emp = empResult.rows[0];
        const permissions = { ...emp.permissions_config, ...emp.custom_permissions };

        // Check for notification_config or admin permission
        if (!permissions.notification_config && !permissions.admin && !permissions.settings) {
          return res.status(403).json({ success: false, message: '無通知設定權限' });
        }

        req.adminBranchId = emp.branch_id;
        req.employeeId = emp.id;
        next();
      } catch (error) {
        console.error('[GymEndpoint] Admin auth error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
      }
    };

    /**
     * GET /gym/admin/notification-config
     * Get branch notification configuration
     */
    router.get('/admin/notification-config', adminNotificationMiddleware, async (req, res) => {
      try {
        const branchId = req.query.branch_id || req.adminBranchId;

        if (!branchId && req.adminBranchId !== null) {
          return res.status(400).json({
            success: false,
            message: '請指定分店',
          });
        }

        let result;
        if (branchId) {
          result = await database.raw(`
            SELECT
              bnc.*,
              b.name as branch_name
            FROM branch_notification_config bnc
            RIGHT JOIN branches b ON b.id = bnc.branch_id
            WHERE b.id = ?::uuid
          `, [branchId]);
        } else {
          // Admin can see all branches
          result = await database.raw(`
            SELECT
              b.id as branch_id,
              b.name as branch_name,
              bnc.id as config_id,
              bnc.line_channel_access_token IS NOT NULL as has_line_config,
              bnc.mitake_username IS NOT NULL as has_sms_config,
              bnc.is_active,
              bnc.date_updated
            FROM branches b
            LEFT JOIN branch_notification_config bnc ON bnc.branch_id = b.id
            WHERE b.status = 'active'
            ORDER BY b.name
          `);

          return res.json({
            success: true,
            branches: result.rows,
          });
        }

        const config = result.rows?.[0];

        // Mask sensitive data
        res.json({
          success: true,
          config: {
            branch_id: branchId,
            branch_name: config?.branch_name,
            has_line_config: !!config?.line_channel_access_token,
            line_channel_access_token_preview: config?.line_channel_access_token
              ? `${config.line_channel_access_token.substring(0, 10)}...`
              : null,
            has_sms_config: !!config?.mitake_username,
            mitake_username: config?.mitake_username || null,
            sms_sender_name: config?.sms_sender_name || null,
            is_active: config?.is_active ?? true,
            date_updated: config?.date_updated,
          },
        });
      } catch (error) {
        console.error('[GymEndpoint] Get notification config error:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * PATCH /gym/admin/notification-config
     * Update branch notification configuration
     */
    router.patch('/admin/notification-config', adminNotificationMiddleware, async (req, res) => {
      try {
        const branchId = req.body.branch_id || req.adminBranchId;

        if (!branchId) {
          return res.status(400).json({
            success: false,
            message: '請指定分店',
          });
        }

        // Non-admin can only update their own branch
        if (req.adminBranchId && req.adminBranchId !== branchId) {
          return res.status(403).json({
            success: false,
            message: '無權限修改其他分店設定',
          });
        }

        const {
          line_channel_access_token,
          line_channel_secret,
          mitake_username,
          mitake_password,
          sms_sender_name,
          is_active,
        } = req.body;

        // Build update fields (only include provided values)
        const updates = {};
        if (line_channel_access_token !== undefined) updates.line_channel_access_token = line_channel_access_token || null;
        if (line_channel_secret !== undefined) updates.line_channel_secret = line_channel_secret || null;
        if (mitake_username !== undefined) updates.mitake_username = mitake_username || null;
        if (mitake_password !== undefined) updates.mitake_password = mitake_password || null;
        if (sms_sender_name !== undefined) updates.sms_sender_name = sms_sender_name || null;
        if (is_active !== undefined) updates.is_active = is_active;

        if (Object.keys(updates).length === 0) {
          return res.status(400).json({
            success: false,
            message: '請提供要更新的欄位',
          });
        }

        updates.date_updated = new Date().toISOString();

        // Upsert config
        const existingResult = await database.raw(`
          SELECT id FROM branch_notification_config WHERE branch_id = ?::uuid
        `, [branchId]);

        if (existingResult.rows?.length > 0) {
          // Update
          const setClauses = Object.keys(updates).map((key, i) => `${key} = $${i + 2}`).join(', ');
          await database.raw(`
            UPDATE branch_notification_config
            SET ${setClauses}
            WHERE branch_id = $1::uuid
          `, [branchId, ...Object.values(updates)]);
        } else {
          // Insert
          updates.branch_id = branchId;
          updates.date_created = new Date().toISOString();
          const columns = Object.keys(updates).join(', ');
          const placeholders = Object.keys(updates).map((_, i) => `$${i + 1}`).join(', ');
          await database.raw(`
            INSERT INTO branch_notification_config (${columns})
            VALUES (${placeholders})
          `, Object.values(updates));
        }

        res.json({
          success: true,
          message: '設定已更新',
        });
      } catch (error) {
        console.error('[GymEndpoint] Update notification config error:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * POST /gym/admin/notification-config/test
     * Test notification configuration
     */
    router.post('/admin/notification-config/test', adminNotificationMiddleware, async (req, res) => {
      try {
        const branchId = req.body.branch_id || req.adminBranchId;
        const { channel } = req.body; // 'line' or 'sms'

        if (!branchId) {
          return res.status(400).json({
            success: false,
            message: '請指定分店',
          });
        }

        if (!channel || !['line', 'sms'].includes(channel)) {
          return res.status(400).json({
            success: false,
            message: '請指定測試通道 (line 或 sms)',
          });
        }

        // Get branch config
        const configResult = await database.raw(`
          SELECT * FROM branch_notification_config WHERE branch_id = ?::uuid
        `, [branchId]);

        const config = configResult.rows?.[0];

        if (channel === 'line') {
          const token = config?.line_channel_access_token || env.LINE_CHANNEL_ACCESS_TOKEN;
          if (!token) {
            return res.json({
              success: false,
              channel: 'line',
              message: '未設定 LINE Channel Access Token',
            });
          }

          // Test LINE API by getting bot info
          try {
            const response = await fetch('https://api.line.me/v2/bot/info', {
              headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.ok) {
              const botInfo = await response.json();
              return res.json({
                success: true,
                channel: 'line',
                message: 'LINE 設定有效',
                details: {
                  botName: botInfo.displayName,
                  botUserId: botInfo.userId,
                },
              });
            } else {
              const error = await response.json();
              return res.json({
                success: false,
                channel: 'line',
                message: 'LINE Token 無效',
                error: error.message,
              });
            }
          } catch (e) {
            return res.json({
              success: false,
              channel: 'line',
              message: 'LINE API 連線失敗',
              error: e.message,
            });
          }
        }

        if (channel === 'sms') {
          const username = config?.mitake_username || env.MITAKE_USERNAME;
          const password = config?.mitake_password || env.MITAKE_PASSWORD;

          if (!username || !password) {
            return res.json({
              success: false,
              channel: 'sms',
              message: '未設定三竹簡訊帳號',
            });
          }

          // Test Mitake API by checking balance
          try {
            const smsService = await import('../../../directus-extension-gym-hooks/src/sms-service.js');
            const balance = await smsService.checkBalance({ username, password });

            return res.json({
              success: true,
              channel: 'sms',
              message: '簡訊設定有效',
              details: {
                balance: balance.points,
                accountPoint: balance.accountPoint,
              },
            });
          } catch (e) {
            return res.json({
              success: false,
              channel: 'sms',
              message: '簡訊帳號驗證失敗',
              error: e.message,
            });
          }
        }
      } catch (error) {
        console.error('[GymEndpoint] Test notification config error:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    // ============================================
    // 10. Notification Usage Statistics (Billing)
    // ============================================

    /**
     * GET /gym/admin/notification-usage
     * Get notification usage statistics for billing
     */
    router.get('/admin/notification-usage', adminNotificationMiddleware, async (req, res) => {
      try {
        const branchId = req.query.branch_id || req.adminBranchId;
        const { start_date, end_date, group_by = 'day' } = req.query;

        // Default to current month
        const now = new Date();
        const startDate = start_date || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const endDate = end_date || now.toISOString().split('T')[0];

        // Get SMS usage and costs
        let smsQuery = `
          SELECT
            ${group_by === 'day' ? "DATE(date_created) as period" : "DATE_TRUNC('month', date_created) as period"},
            branch_id,
            COUNT(*) as total_sent,
            COUNT(*) FILTER (WHERE status = 'sent') as success_count,
            COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
            SUM(COALESCE(cost, 0)) as total_cost,
            SUM(segments) as total_segments
          FROM sms_logs
          WHERE date_created >= ?::date AND date_created < (?::date + INTERVAL '1 day')
        `;

        const smsParams = [startDate, endDate];

        if (branchId) {
          smsQuery += ` AND branch_id = ?::uuid`;
          smsParams.push(branchId);
        }

        smsQuery += ` GROUP BY period${branchId ? '' : ', branch_id'} ORDER BY period DESC`;

        const smsResult = await database.raw(smsQuery, smsParams);

        // Get LINE usage
        let lineQuery = `
          SELECT
            ${group_by === 'day' ? "DATE(date_created) as period" : "DATE_TRUNC('month', date_created) as period"},
            branch_id,
            COUNT(*) as total_sent,
            COUNT(*) FILTER (WHERE status = 'sent') as success_count,
            COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
            message_type,
            COUNT(*) as type_count
          FROM line_message_logs
          WHERE date_created >= ?::date AND date_created < (?::date + INTERVAL '1 day')
        `;

        const lineParams = [startDate, endDate];

        if (branchId) {
          lineQuery += ` AND branch_id = ?::uuid`;
          lineParams.push(branchId);
        }

        lineQuery += ` GROUP BY period, message_type${branchId ? '' : ', branch_id'} ORDER BY period DESC`;

        const lineResult = await database.raw(lineQuery, lineParams);

        // Get overall notification logs
        let notificationQuery = `
          SELECT
            ${group_by === 'day' ? "DATE(date_created) as period" : "DATE_TRUNC('month', date_created) as period"},
            notification_type,
            successful_channel,
            overall_status,
            COUNT(*) as count
          FROM notification_logs
          WHERE date_created >= ?::date AND date_created < (?::date + INTERVAL '1 day')
        `;

        const notificationParams = [startDate, endDate];

        if (branchId) {
          notificationQuery += ` AND branch_id = ?::uuid`;
          notificationParams.push(branchId);
        }

        notificationQuery += ` GROUP BY period, notification_type, successful_channel, overall_status ORDER BY period DESC`;

        const notificationResult = await database.raw(notificationQuery, notificationParams);

        // Calculate summary
        const smsSummary = smsResult.rows?.reduce((acc, row) => ({
          total_sent: acc.total_sent + parseInt(row.total_sent || 0),
          success_count: acc.success_count + parseInt(row.success_count || 0),
          failed_count: acc.failed_count + parseInt(row.failed_count || 0),
          total_cost: acc.total_cost + parseFloat(row.total_cost || 0),
          total_segments: acc.total_segments + parseInt(row.total_segments || 0),
        }), { total_sent: 0, success_count: 0, failed_count: 0, total_cost: 0, total_segments: 0 });

        const lineSummary = lineResult.rows?.reduce((acc, row) => ({
          total_sent: acc.total_sent + parseInt(row.total_sent || 0),
          success_count: acc.success_count + parseInt(row.success_count || 0),
          failed_count: acc.failed_count + parseInt(row.failed_count || 0),
        }), { total_sent: 0, success_count: 0, failed_count: 0 });

        res.json({
          success: true,
          period: { start_date: startDate, end_date: endDate, group_by },
          branch_id: branchId || 'all',
          summary: {
            sms: smsSummary,
            line: lineSummary,
          },
          details: {
            sms: smsResult.rows || [],
            line: lineResult.rows || [],
            notifications: notificationResult.rows || [],
          },
        });
      } catch (error) {
        console.error('[GymEndpoint] Get notification usage error:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    /**
     * GET /gym/admin/notification-usage/export
     * Export notification usage as CSV for billing
     */
    router.get('/admin/notification-usage/export', adminNotificationMiddleware, async (req, res) => {
      try {
        const branchId = req.query.branch_id || req.adminBranchId;
        const { start_date, end_date, format = 'csv' } = req.query;

        // Default to current month
        const now = new Date();
        const startDate = start_date || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const endDate = end_date || now.toISOString().split('T')[0];

        // Get detailed SMS logs
        let query = `
          SELECT
            sl.date_created,
            b.name as branch_name,
            m.full_name as member_name,
            sl.phone_number,
            sl.message_type,
            sl.status,
            sl.segments,
            sl.cost,
            sl.provider_message_id
          FROM sms_logs sl
          LEFT JOIN branches b ON b.id = sl.branch_id
          LEFT JOIN members m ON m.id = sl.member_id
          WHERE sl.date_created >= ?::date AND sl.date_created < (?::date + INTERVAL '1 day')
        `;

        const params = [startDate, endDate];

        if (branchId) {
          query += ` AND sl.branch_id = ?::uuid`;
          params.push(branchId);
        }

        query += ` ORDER BY sl.date_created DESC`;

        const result = await database.raw(query, params);
        const rows = result.rows || [];

        if (format === 'csv') {
          // Generate CSV
          const headers = ['日期時間', '分店', '會員', '電話', '類型', '狀態', '則數', '費用', '訊息ID'];
          const csvRows = [headers.join(',')];

          for (const row of rows) {
            csvRows.push([
              row.date_created,
              row.branch_name || '',
              row.member_name || '',
              row.phone_number || '',
              row.message_type || '',
              row.status || '',
              row.segments || 1,
              row.cost || 0,
              row.provider_message_id || '',
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
          }

          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          res.setHeader('Content-Disposition', `attachment; filename="sms-usage-${startDate}-${endDate}.csv"`);
          res.send('\uFEFF' + csvRows.join('\n')); // BOM for Excel
        } else {
          res.json({
            success: true,
            data: rows,
          });
        }
      } catch (error) {
        console.error('[GymEndpoint] Export notification usage error:', error);
        res.status(500).json({
          success: false,
          message: error.message || 'Internal server error',
        });
      }
    });

    console.log('[GymEndpoint] Gym API endpoints registered');
  },
};
