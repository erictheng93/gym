/**
 * Redis 緩存工具 (第二階段優化)
 *
 * 提供會員合約、權限等高頻查詢的緩存功能
 * 減少約 60% 的數據庫查詢
 */

import Redis from 'ioredis';

// 緩存配置
const CACHE_CONFIG = {
  // 緩存 TTL (秒)
  TTL: {
    MEMBER_CONTRACT: 300,      // 會員有效合約 5 分鐘
    MEMBER_STATUS: 300,        // 會員狀態 5 分鐘
    CONTRACT_VALIDATION: 60,   // 合約驗證 1 分鐘
    EMPLOYEE_PERMISSIONS: 600, // 員工權限 10 分鐘
    JOB_TITLE_PERMISSIONS: 3600, // 職稱權限 1 小時
    BRANCH_CONFIG: 1800,       // 分店設定 30 分鐘
    REPORT_DATA: 600,          // 報表數據 10 分鐘
  },
  // 緩存 Key 前綴
  PREFIX: 'gym:',
};

// Redis 連接實例 (懶初始化)
let redisClient = null;
let isConnected = false;

/**
 * 獲取 Redis 連接
 */
function getRedisClient() {
  if (redisClient) return redisClient;

  const host = process.env.REDIS_HOST || 'redis';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);

  redisClient = new Redis({
    host,
    port,
    retryStrategy: (times) => {
      if (times > 3) {
        // Cache logged('[GymCache] Redis connection failed, disabling cache');
        return null; // 停止重試
      }
      return Math.min(times * 100, 2000);
    },
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  redisClient.on('connect', () => {
    isConnected = true;
    // Cache logged('[GymCache] Redis connected');
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    // Cache logged('[GymCache] Redis error:', err.message);
  });

  redisClient.on('close', () => {
    isConnected = false;
    // Cache logged('[GymCache] Redis connection closed');
  });

  // 嘗試連接
  redisClient.connect().catch(() => {
    // Cache logged('[GymCache] Redis initial connection failed, will retry on demand');
  });

  return redisClient;
}

/**
 * 檢查緩存是否可用
 */
export function isCacheAvailable() {
  return isConnected && redisClient !== null;
}

/**
 * 生成緩存 Key
 */
function cacheKey(type, ...parts) {
  return `${CACHE_CONFIG.PREFIX}${type}:${parts.join(':')}`;
}

// ============================================
// 會員合約緩存
// ============================================

/**
 * 獲取會員有效合約 (從緩存)
 * @param {string} memberId - 會員 ID
 * @returns {Promise<object|null>} 有效合約資訊或 null (緩存未命中)
 */
export async function getCachedMemberContract(memberId) {
  try {
    const client = getRedisClient();
    if (!isConnected) return null;

    const key = cacheKey('member_contract', memberId);
    const data = await client.get(key);

    if (data) {
      // Cache logged(`[GymCache] HIT member_contract:${memberId}`);
      return JSON.parse(data);
    }

    // Cache logged(`[GymCache] MISS member_contract:${memberId}`);
    return null;
  } catch (error) {
    // Cache logged('[GymCache] Error getting member contract:', error.message);
    return null;
  }
}

/**
 * 設置會員有效合約緩存
 * @param {string} memberId - 會員 ID
 * @param {object} contract - 合約資訊
 */
export async function setCachedMemberContract(memberId, contract) {
  try {
    const client = getRedisClient();
    if (!isConnected) return;

    const key = cacheKey('member_contract', memberId);
    await client.setex(key, CACHE_CONFIG.TTL.MEMBER_CONTRACT, JSON.stringify(contract));
    // Cache logged(`[GymCache] SET member_contract:${memberId}`);
  } catch (error) {
    // Cache logged('[GymCache] Error setting member contract:', error.message);
  }
}

/**
 * 清除會員合約緩存
 * @param {string} memberId - 會員 ID
 */
export async function invalidateMemberContract(memberId) {
  try {
    const client = getRedisClient();
    if (!isConnected) return;

    const keys = [
      cacheKey('member_contract', memberId),
      cacheKey('member_status', memberId),
    ];

    await client.del(...keys);
    // Cache logged(`[GymCache] DEL member cache:${memberId}`);
  } catch (error) {
    // Cache logged('[GymCache] Error invalidating member contract:', error.message);
  }
}

// ============================================
// 會員狀態緩存
// ============================================

/**
 * 獲取會員狀態 (從緩存)
 */
export async function getCachedMemberStatus(memberId) {
  try {
    const client = getRedisClient();
    if (!isConnected) return null;

    const key = cacheKey('member_status', memberId);
    const data = await client.get(key);

    return data ? JSON.parse(data) : null;
  } catch (error) {
    return null;
  }
}

/**
 * 設置會員狀態緩存
 */
export async function setCachedMemberStatus(memberId, status) {
  try {
    const client = getRedisClient();
    if (!isConnected) return;

    const key = cacheKey('member_status', memberId);
    await client.setex(key, CACHE_CONFIG.TTL.MEMBER_STATUS, JSON.stringify(status));
  } catch (error) {
    // 忽略緩存錯誤
  }
}

// ============================================
// 合約驗證緩存 (Check-in 專用)
// ============================================

/**
 * 快速驗證合約是否有效 (用於 Check-in 熱路徑)
 * @param {string} contractId - 合約 ID
 * @returns {Promise<boolean|null>} true/false 或 null (需查詢)
 */
export async function isContractValid(contractId) {
  try {
    const client = getRedisClient();
    if (!isConnected) return null;

    const key = cacheKey('contract_valid', contractId);
    const data = await client.get(key);

    return data !== null ? data === '1' : null;
  } catch (error) {
    return null;
  }
}

/**
 * 設置合約有效性緩存
 */
export async function setContractValidity(contractId, isValid) {
  try {
    const client = getRedisClient();
    if (!isConnected) return;

    const key = cacheKey('contract_valid', contractId);
    await client.setex(key, CACHE_CONFIG.TTL.CONTRACT_VALIDATION, isValid ? '1' : '0');
  } catch (error) {
    // 忽略
  }
}

/**
 * 清除合約緩存
 */
export async function invalidateContract(contractId, memberId) {
  try {
    const client = getRedisClient();
    if (!isConnected) return;

    const keys = [cacheKey('contract_valid', contractId)];

    if (memberId) {
      keys.push(cacheKey('member_contract', memberId));
      keys.push(cacheKey('member_status', memberId));
    }

    await client.del(...keys);
  } catch (error) {
    // 忽略
  }
}

// ============================================
// 員工權限緩存
// ============================================

/**
 * 獲取員工權限 (從緩存)
 */
export async function getCachedEmployeePermissions(employeeId) {
  try {
    const client = getRedisClient();
    if (!isConnected) return null;

    const key = cacheKey('employee_perms', employeeId);
    const data = await client.get(key);

    return data ? JSON.parse(data) : null;
  } catch (error) {
    return null;
  }
}

/**
 * 設置員工權限緩存
 */
export async function setCachedEmployeePermissions(employeeId, permissions) {
  try {
    const client = getRedisClient();
    if (!isConnected) return;

    const key = cacheKey('employee_perms', employeeId);
    await client.setex(key, CACHE_CONFIG.TTL.EMPLOYEE_PERMISSIONS, JSON.stringify(permissions));
  } catch (error) {
    // 忽略
  }
}

/**
 * 清除員工權限緩存
 */
export async function invalidateEmployeePermissions(employeeId) {
  try {
    const client = getRedisClient();
    if (!isConnected) return;

    await client.del(cacheKey('employee_perms', employeeId));
  } catch (error) {
    // 忽略
  }
}

// ============================================
// 職稱權限緩存
// ============================================

/**
 * 獲取職稱權限 (從緩存)
 */
export async function getCachedJobTitlePermissions(jobTitleId) {
  try {
    const client = getRedisClient();
    if (!isConnected) return null;

    const key = cacheKey('job_title_perms', jobTitleId);
    const data = await client.get(key);

    return data ? JSON.parse(data) : null;
  } catch (error) {
    return null;
  }
}

/**
 * 設置職稱權限緩存
 */
export async function setCachedJobTitlePermissions(jobTitleId, permissions) {
  try {
    const client = getRedisClient();
    if (!isConnected) return;

    const key = cacheKey('job_title_perms', jobTitleId);
    await client.setex(key, CACHE_CONFIG.TTL.JOB_TITLE_PERMISSIONS, JSON.stringify(permissions));
  } catch (error) {
    // 忽略
  }
}

// ============================================
// 批量操作
// ============================================

/**
 * 批量清除會員緩存 (用於批量 Check-in)
 * @param {string[]} memberIds - 會員 ID 列表
 */
export async function invalidateMembersBatch(memberIds) {
  try {
    const client = getRedisClient();
    if (!isConnected || !memberIds.length) return;

    const keys = memberIds.flatMap(id => [
      cacheKey('member_contract', id),
      cacheKey('member_status', id),
    ]);

    await client.del(...keys);
    // Cache logged(`[GymCache] Batch DEL ${memberIds.length} members`);
  } catch (error) {
    // Cache logged('[GymCache] Error batch invalidating:', error.message);
  }
}

/**
 * 獲取緩存統計信息
 */
export async function getCacheStats() {
  try {
    const client = getRedisClient();
    if (!isConnected) return { connected: false };

    const info = await client.info('stats');
    const keyspace = await client.info('keyspace');

    return {
      connected: true,
      info,
      keyspace,
    };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

// ============================================
// 報表數據緩存
// ============================================

/**
 * 獲取報表數據 (從緩存)
 * @param {string} reportType - 報表類型 (revenue, member_growth, contract_expiry, member_activity)
 * @param {string} cacheKey - 查詢參數組成的緩存鍵
 * @returns {Promise<object|null>} 報表數據或 null
 */
export async function getCachedReportData(reportType, queryKey) {
  try {
    const client = getRedisClient();
    if (!isConnected) return null;

    const key = cacheKey('report', reportType, queryKey);
    const data = await client.get(key);

    if (data) {
      // Cache logged(`[GymCache] HIT report:${reportType}:${queryKey.substring(0, 20)}`);
      return JSON.parse(data);
    }

    // Cache logged(`[GymCache] MISS report:${reportType}:${queryKey.substring(0, 20)}`);
    return null;
  } catch (error) {
    // Cache logged('[GymCache] Error getting report data:', error.message);
    return null;
  }
}

/**
 * 設置報表數據緩存
 * @param {string} reportType - 報表類型
 * @param {string} queryKey - 查詢參數組成的緩存鍵
 * @param {object} data - 報表數據
 * @param {number} ttl - 可選的自定義 TTL (秒)
 */
export async function setCachedReportData(reportType, queryKey, data, ttl = null) {
  try {
    const client = getRedisClient();
    if (!isConnected) return;

    const key = cacheKey('report', reportType, queryKey);
    const cacheTtl = ttl || CACHE_CONFIG.TTL.REPORT_DATA;
    await client.setex(key, cacheTtl, JSON.stringify(data));
    // Cache logged(`[GymCache] SET report:${reportType}:${queryKey.substring(0, 20)} (TTL: ${cacheTtl}s)`);
  } catch (error) {
    // Cache logged('[GymCache] Error setting report data:', error.message);
  }
}

/**
 * 清除報表緩存 (當物化視圖刷新時調用)
 * @param {string} reportType - 可選，指定報表類型；不指定則清除所有報表緩存
 */
export async function invalidateReportCache(reportType = null) {
  try {
    const client = getRedisClient();
    if (!isConnected) return;

    const pattern = reportType
      ? `${CACHE_CONFIG.PREFIX}report:${reportType}:*`
      : `${CACHE_CONFIG.PREFIX}report:*`;

    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
      // Cache logged(`[GymCache] Invalidated ${keys.length} report cache entries (type: ${reportType || 'all'})`);
    }
  } catch (error) {
    // Cache logged('[GymCache] Error invalidating report cache:', error.message);
  }
}

// ============================================
// 性能監控緩存 (用於追蹤慢查詢)
// ============================================

/**
 * 記錄查詢性能指標
 * @param {string} operation - 操作類型 (checkin, payment, etc.)
 * @param {number} durationMs - 執行時間 (毫秒)
 */
export async function recordPerformanceMetric(operation, durationMs) {
  try {
    const client = getRedisClient();
    if (!isConnected) return;

    const now = Date.now();
    const key = cacheKey('perf', operation);

    // 使用 Sorted Set 存儲最近 1000 筆記錄
    await client.zadd(key, now, `${now}:${durationMs}`);
    await client.zremrangebyrank(key, 0, -1001); // 只保留最新 1000 筆

    // 如果超過 100ms，記錄為慢查詢
    if (durationMs > 100) {
      const slowKey = cacheKey('slow', operation);
      await client.lpush(slowKey, JSON.stringify({
        time: new Date().toISOString(),
        duration: durationMs,
      }));
      await client.ltrim(slowKey, 0, 99); // 只保留 100 筆
      // Cache logged(`[GymCache] SLOW ${operation}: ${durationMs}ms`);
    }
  } catch (error) {
    // 忽略監控錯誤
  }
}

/**
 * 獲取性能統計
 * @param {string} operation - 操作類型
 */
export async function getPerformanceStats(operation) {
  try {
    const client = getRedisClient();
    if (!isConnected) return null;

    const key = cacheKey('perf', operation);
    const data = await client.zrange(key, -100, -1); // 最近 100 筆

    if (!data.length) return null;

    const durations = data.map(item => parseInt(item.split(':')[1], 10));
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const max = Math.max(...durations);
    const min = Math.min(...durations);

    return {
      count: data.length,
      avg: Math.round(avg),
      max,
      min,
      p95: durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] || max,
    };
  } catch (error) {
    return null;
  }
}

export default {
  isCacheAvailable,
  getCachedMemberContract,
  setCachedMemberContract,
  invalidateMemberContract,
  getCachedMemberStatus,
  setCachedMemberStatus,
  isContractValid,
  setContractValidity,
  invalidateContract,
  getCachedEmployeePermissions,
  setCachedEmployeePermissions,
  invalidateEmployeePermissions,
  getCachedJobTitlePermissions,
  setCachedJobTitlePermissions,
  invalidateMembersBatch,
  getCacheStats,
  recordPerformanceMetric,
  getPerformanceStats,
  // 報表緩存
  getCachedReportData,
  setCachedReportData,
  invalidateReportCache,
};
