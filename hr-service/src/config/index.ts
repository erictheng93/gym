/**
 * HR Service Configuration
 */

import dotenv from 'dotenv'

dotenv.config()

const DEV_FALLBACK_SECRET = 'dev-secret-change-in-production'
const KNOWN_DEFAULT_SECRETS = [DEV_FALLBACK_SECRET, 'change-me-in-production', 'change-this-in-production']

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (process.env.NODE_ENV === 'production') {
    if (!secret) {
      throw new Error('JWT_SECRET must be set in production')
    }
    if (KNOWN_DEFAULT_SECRETS.includes(secret) || secret.length < 32) {
      throw new Error('JWT_SECRET must be a non-default secret of at least 32 characters in production')
    }
    return secret
  }
  return secret || DEV_FALLBACK_SECRET
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // Database
  database: {
    url: process.env.DATABASE_URL || 'postgresql://hr_user:hr_password@localhost:5432/hr_db',
    poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DATABASE_POOL_MAX || '10', 10)
  },

  // JWT
  jwt: {
    secret: resolveJwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },

  // Main System Integration
  mainSystem: {
    apiUrl: process.env.MAIN_SYSTEM_API_URL || 'http://localhost:8500',
    apiKey: process.env.MAIN_SYSTEM_API_KEY || ''
  },

  // Employee Sync
  sync: {
    enabled: process.env.SYNC_ENABLED === 'true',
    intervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '15', 10),
    webhookSecret: process.env.SYNC_WEBHOOK_SECRET || ''
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002,http://127.0.0.1:3003,http://127.0.0.1:3004,http://127.0.0.1:3005').split(',').map(o => o.trim().replace(/\/$/, '')).filter(Boolean)
} as const

export type Config = typeof config
