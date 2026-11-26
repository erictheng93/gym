/**
 * E2E test environment configuration.
 * Defaults match the backend seed (`cd backend && bun run db:seed`).
 * Override via env vars or a `frontend/.env.test` file.
 */
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envTestPath = path.resolve(__dirname, '../../.env.test')
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath })
}

const env = process.env

export const TestEnv = {
  urls: {
    admin: env.ADMIN_BASE_URL || 'http://localhost:3001',
    member: env.MEMBER_BASE_URL || 'http://localhost:3002',
    coach: env.COACH_BASE_URL || 'http://localhost:3003',
  },

  users: {
    /** Staff account with full (HQ) access */
    admin: {
      email: env.TEST_ADMIN_EMAIL || 'admin@gym.com',
      password: env.TEST_ADMIN_PASSWORD || 'admin',
    },
    /** Branch manager (role: manager) */
    manager: {
      email: env.TEST_MANAGER_EMAIL || 'manager.taipei@gym.com',
      password: env.TEST_MANAGER_PASSWORD || 'manager123',
    },
    /** Coach (staff user in admin-web, coach account in coach-app) */
    coach: {
      email: env.TEST_COACH_EMAIL || 'coach.chen@gym.com',
      password: env.TEST_COACH_PASSWORD || 'coach123',
    },
    /** Member account for member-app */
    member: {
      email: env.TEST_MEMBER_EMAIL || 'member1@example.com',
      password: env.TEST_MEMBER_PASSWORD || 'member123',
    },
  },

  timeouts: {
    default: parseInt(env.DEFAULT_TIMEOUT || '15000', 10),
    api: parseInt(env.API_TIMEOUT || '15000', 10),
    navigation: parseInt(env.NAVIGATION_TIMEOUT || '30000', 10),
  },

  isCI: env.CI === 'true',
  retries: parseInt(env.TEST_RETRIES || '2', 10),
} as const

export default TestEnv
