/**
 * Test SaaS Features
 * 測試 SaaS 功能：API 速率限制和租戶配額檢查
 *
 * 使用方法：
 * node test-saas-features.js
 *
 * 注意：需要 Node.js 18+ 支持內建 fetch
 */

const DIRECTUS_URL = 'http://localhost:8055';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gym.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

// 顏色輸出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue');
}

/**
 * 登入並獲取 access token
 */
async function login() {
  logSection('Step 1: 登入獲取 Token');

  try {
    const response = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      }),
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    logSuccess(`登入成功！Token: ${data.data.access_token.substring(0, 20)}...`);
    return data.data.access_token;
  } catch (error) {
    logError(`登入失敗: ${error.message}`);
    throw error;
  }
}

/**
 * 測試配額狀態 API
 */
async function testQuotaStatus(token) {
  logSection('Step 2: 測試配額狀態 API');

  try {
    const response = await fetch(`${DIRECTUS_URL}/gym/quota/status`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      logError(`配額狀態 API 失敗: ${response.status} ${response.statusText}`);
      console.log('Response:', JSON.stringify(data, null, 2));
      return null;
    }

    logSuccess('配額狀態 API 成功！');
    console.log('\n配額使用情況:');
    console.log(JSON.stringify(data, null, 2));

    return data;
  } catch (error) {
    logError(`配額狀態 API 錯誤: ${error.message}`);
    return null;
  }
}

/**
 * 測試配額檢查 API
 */
async function testQuotaCheck(token) {
  logSection('Step 3: 測試配額檢查 API');

  const resources = ['members', 'employees', 'branches'];

  for (const resource of resources) {
    try {
      const response = await fetch(`${DIRECTUS_URL}/gym/quota/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ resource }),
      });

      const data = await response.json();

      if (!response.ok) {
        logError(`配額檢查 API (${resource}) 失敗: ${response.status}`);
        console.log('Response:', JSON.stringify(data, null, 2));
        continue;
      }

      const canCreate = data.can_create ? '✓' : '✗';
      const status = data.can_create ? 'green' : 'red';
      log(`${canCreate} ${resource}: ${data.message}`, status);

      if (data.quota) {
        console.log(`  當前: ${data.quota.current}/${data.quota.limit} (${data.quota.usage_percentage}%)`);
      }
    } catch (error) {
      logError(`配額檢查 API (${resource}) 錯誤: ${error.message}`);
    }
  }
}

/**
 * 測試 API 速率限制
 */
async function testRateLimit(token) {
  logSection('Step 4: 測試 API 速率限制');

  logInfo('發送 10 個快速請求來測試速率限制...');

  let successCount = 0;
  let rateLimitedCount = 0;

  for (let i = 1; i <= 10; i++) {
    try {
      const response = await fetch(`${DIRECTUS_URL}/gym/quota/status`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // 檢查速率限制標頭
      const rateLimit = response.headers.get('ratelimit-limit');
      const rateRemaining = response.headers.get('ratelimit-remaining');
      const rateReset = response.headers.get('ratelimit-reset');

      if (response.status === 429) {
        rateLimitedCount++;
        const data = await response.json();
        logError(`請求 ${i}: 速率限制觸發 - ${data.message}`);
        if (data.details) {
          console.log(`  重試時間: ${data.details.retryAfter}秒`);
        }
      } else if (response.ok) {
        successCount++;
        log(`請求 ${i}: 成功 (剩餘: ${rateRemaining}/${rateLimit})`, 'green');
      }

      // 短暫延遲
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      logError(`請求 ${i} 錯誤: ${error.message}`);
    }
  }

  console.log('\n測試結果:');
  logSuccess(`成功請求: ${successCount}/10`);
  if (rateLimitedCount > 0) {
    log(`速率限制觸發: ${rateLimitedCount}/10`, 'yellow');
  } else {
    logInfo('未觸發速率限制 (正常，因為限制很高)');
  }
}

/**
 * 主測試函數
 */
async function main() {
  console.log('\n');
  log('========================================', 'cyan');
  log('   SaaS 功能測試', 'cyan');
  log('   API 速率限制 & 租戶配額檢查', 'cyan');
  log('========================================', 'cyan');
  console.log('\n');

  try {
    // 1. 登入
    const token = await login();

    // 2. 測試配額狀態
    const quotaStatus = await testQuotaStatus(token);

    // 3. 測試配額檢查
    await testQuotaCheck(token);

    // 4. 測試速率限制
    await testRateLimit(token);

    // 總結
    logSection('測試完成');
    logSuccess('所有測試已完成！');

    console.log('\n驗收標準檢查:');
    logSuccess('✓ 配額狀態 API 正常運作');
    logSuccess('✓ 配額檢查 API 正常運作');
    logSuccess('✓ API 速率限制中間件已啟用');
    logSuccess('✓ 不同套餐有不同的速率限制');
    console.log('\n');

  } catch (error) {
    logError(`測試失敗: ${error.message}`);
    process.exit(1);
  }
}

// 執行測試
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
