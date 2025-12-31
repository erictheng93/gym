/**
 * Redis Cache Utilities
 * 用於報表查詢結果的緩存
 */

let redisClient = null;
let redisAvailable = false;

const REPORT_CACHE_TTL = 600; // 10 分鐘
const CACHE_PREFIX = 'gym:report:';

/**
 * 初始化 Redis 連接（非阻塞）
 */
export async function initRedis() {
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

/**
 * 獲取緩存的報表數據
 * @param {string} reportType - 報表類型
 * @param {string} queryKey - 查詢鍵值
 * @returns {Promise<object|null>} 緩存數據或 null
 */
export async function getCachedReport(reportType, queryKey) {
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

/**
 * 設置報表緩存
 * @param {string} reportType - 報表類型
 * @param {string} queryKey - 查詢鍵值
 * @param {object} data - 要緩存的數據
 */
export async function setCachedReport(reportType, queryKey, data) {
  if (!redisAvailable || !redisClient) return;
  try {
    const key = `${CACHE_PREFIX}${reportType}:${queryKey}`;
    await redisClient.setex(key, REPORT_CACHE_TTL, JSON.stringify(data));
    console.log(`[GymEndpoint] Cache SET: ${reportType}`);
  } catch (error) {
    // 忽略緩存錯誤
  }
}

/**
 * 清除所有報表緩存
 */
export async function invalidateReportCache() {
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

/**
 * 獲取緩存統計
 * @returns {Promise<object>} 緩存統計信息
 */
export async function getCacheStats() {
  if (!redisAvailable || !redisClient) {
    return { available: false, keys: 0 };
  }
  try {
    const keys = await redisClient.keys(`${CACHE_PREFIX}*`);
    return {
      available: true,
      keys: keys.length,
      prefix: CACHE_PREFIX,
      ttl: REPORT_CACHE_TTL,
    };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

export function isRedisAvailable() {
  return redisAvailable;
}
