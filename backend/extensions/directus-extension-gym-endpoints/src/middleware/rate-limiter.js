/**
 * API Rate Limiter Middleware
 * API 速率限制中間件
 *
 * 功能：
 * 1. 根據租戶套餐類型設定不同的速率限制
 * 2. 使用 Redis 存儲速率限制數據
 * 3. 返回標準化的速率限制響應頭
 * 4. 超限時返回 429 狀態碼
 */

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

// 租戶級別的速率限制配置
const RATE_LIMITS = {
  starter: { windowMs: 15 * 60 * 1000, max: 500 },      // 500 req / 15min
  professional: { windowMs: 15 * 60 * 1000, max: 2000 }, // 2000 req / 15min
  enterprise: { windowMs: 15 * 60 * 1000, max: 10000 },  // 10000 req / 15min
  custom: { windowMs: 15 * 60 * 1000, max: 50000 }       // 50000 req / 15min
};

/**
 * 創建速率限制器中間件
 * @returns {Function} Express 中間件
 */
export function createRateLimiter() {
  // 初始化 Redis 客戶端
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6333'),
    retryStrategy: (times) => {
      // 重試策略：最多重試 3 次
      if (times > 3) {
        // Error logged('[RateLimiter] Redis connection failed after 3 retries');
        return null; // 停止重試
      }
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  // Redis 連接錯誤處理
  redis.on('error', (err) => {
    // Error logged('[RateLimiter] Redis error:', err.message);
  });

  redis.on('connect', () => {
    // Status logged('[RateLimiter] Redis connected successfully');
  });

  return rateLimit({
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: 'rl:',
    }),
    windowMs: 15 * 60 * 1000, // 默認 15 分鐘
    max: async (req) => {
      // 超級管理員無速率限制
      if (req.isSuperAdmin) {
        return 999999;
      }

      const planType = req.planType || 'starter';
      const limit = RATE_LIMITS[planType]?.max || 500;
      return limit;
    },
    keyGenerator: (req) => {
      // 使用 tenant_id 作為限制鍵
      // 超級管理員使用 user_id
      if (req.isSuperAdmin) {
        return `admin:${req.accountability?.user || 'unknown'}`;
      }
      return `tenant:${req.tenantId || 'anonymous'}`;
    },
    handler: async (req, res) => {
      const planType = req.planType || 'starter';
      const limit = RATE_LIMITS[planType]?.max || 500;
      const resetTime = req.rateLimit?.resetTime || Date.now();
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);

      // 記錄速率限制觸發到 Redis
      const logKey = `rl:log:${req.tenantId || 'anonymous'}:${Date.now()}`;
      const logData = {
        timestamp: new Date().toISOString(),
        tenantId: req.tenantId || null,
        planType,
        limit,
        endpoint: req.path,
        method: req.method,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
      };

      try {
        // 存儲日誌到 Redis（7天過期）
        await redis.setex(logKey, 7 * 24 * 60 * 60, JSON.stringify(logData));

        // 同時將日誌 ID 加入到租戶的日誌列表
        const listKey = `rl:logs:${req.tenantId || 'anonymous'}`;
        await redis.lpush(listKey, logKey);
        await redis.ltrim(listKey, 0, 999); // 保留最近 1000 條
        await redis.expire(listKey, 7 * 24 * 60 * 60); // 7天過期

        logger.warn('Rate limit exceeded', {
          tenantId: req.tenantId,
          path: req.path,
          planType
        });
      } catch (error) {
        // Error logged('[RateLimiter] Error logging rate limit hit:', error);
      }

      res.status(429).json({
        success: false,
        message: 'API 請求頻率超限，請稍後再試',
        error_code: 'RATE_LIMIT_EXCEEDED',
        details: {
          limit,
          windowMs: 15 * 60 * 1000,
          retryAfter,
          planType,
        },
      });
    },
    standardHeaders: true, // 返回 RateLimit-* 標準頭
    legacyHeaders: false,  // 禁用 X-RateLimit-* 舊標頭
    skip: (req) => {
      // 超級管理員永不觸發速率限制（但仍計數）
      return false;
    },
  });
}

/**
 * 獲取速率限制配置（供外部查詢）
 * @param {string} planType - 套餐類型
 * @returns {object} 速率限制配置
 */
export function getRateLimitConfig(planType = 'starter') {
  return RATE_LIMITS[planType] || RATE_LIMITS.starter;
}

export default createRateLimiter;
