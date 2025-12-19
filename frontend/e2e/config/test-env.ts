/**
 * 測試環境配置管理
 * Test Environment Configuration Management
 */

// 從 .env.test 文件加載環境變數（如果存在）
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

// 嘗試加載 .env.test 文件
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const envTestPath = path.resolve(__dirname, '../../.env.test')
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath })
}

/**
 * 測試環境配置
 */
export const TestEnv = {
  // 應用 URL
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  // Directus API URL
  directusUrl: process.env.DIRECTUS_URL || 'http://localhost:8500',

  // 測試用戶
  users: {
    admin: {
      email: process.env.TEST_ADMIN_EMAIL || 'admin@gym.com',
      password: process.env.TEST_ADMIN_PASSWORD || 'admin',
    },
    hqAdmin: {
      email: process.env.TEST_HQ_ADMIN_EMAIL || 'admin@gym.com',
      password: process.env.TEST_HQ_ADMIN_PASSWORD || 'admin',
    },
    manager: {
      email: process.env.TEST_MANAGER_EMAIL || 'admin@gym.com',
      password: process.env.TEST_MANAGER_PASSWORD || 'admin',
    },
    coach: {
      email: process.env.TEST_COACH_EMAIL || 'admin@gym.com',
      password: process.env.TEST_COACH_PASSWORD || 'admin',
    },
    staff: {
      email: process.env.TEST_STAFF_EMAIL || 'admin@gym.com',
      password: process.env.TEST_STAFF_PASSWORD || 'admin',
    },
  },

  // 超時設置
  timeouts: {
    default: parseInt(process.env.DEFAULT_TIMEOUT || '15000', 10),
    api: parseInt(process.env.API_TIMEOUT || '15000', 10),
    navigation: parseInt(process.env.NAVIGATION_TIMEOUT || '30000', 10),
  },

  // 數據庫設置
  database: {
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
    name: process.env.TEST_DB_NAME || 'gym_nexus_test',
    user: process.env.TEST_DB_USER || 'directus',
    password: process.env.TEST_DB_PASSWORD || 'directus',
  },

  // 測試環境標識
  isCI: process.env.CI === 'true',
  nodeEnv: process.env.NODE_ENV || 'test',

  // 重試設置
  retries: parseInt(process.env.TEST_RETRIES || '2', 10),
} as const

/**
 * 驗證環境配置是否完整
 */
export function validateTestEnv(): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // 驗證必要的 URL
  if (!TestEnv.baseUrl) {
    errors.push('BASE_URL is not configured')
  }

  if (!TestEnv.directusUrl) {
    errors.push('DIRECTUS_URL is not configured')
  }

  // 驗證測試用戶憑證
  if (!TestEnv.users.admin.email || !TestEnv.users.admin.password) {
    errors.push('Admin user credentials are not configured')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 打印環境配置（隱藏敏感信息）
 */
export function printTestEnv(): void {
  console.log('='.repeat(50))
  console.log('測試環境配置 / Test Environment Configuration')
  console.log('='.repeat(50))
  console.log(`Base URL: ${TestEnv.baseUrl}`)
  console.log(`Directus URL: ${TestEnv.directusUrl}`)
  console.log(`Admin Email: ${TestEnv.users.admin.email}`)
  console.log(`Manager Email: ${TestEnv.users.manager.email}`)
  console.log(`Coach Email: ${TestEnv.users.coach.email}`)
  console.log(`Default Timeout: ${TestEnv.timeouts.default}ms`)
  console.log(`API Timeout: ${TestEnv.timeouts.api}ms`)
  console.log(`Navigation Timeout: ${TestEnv.timeouts.navigation}ms`)
  console.log(`Is CI: ${TestEnv.isCI}`)
  console.log(`Node Env: ${TestEnv.nodeEnv}`)
  console.log('='.repeat(50))
}

export default TestEnv
