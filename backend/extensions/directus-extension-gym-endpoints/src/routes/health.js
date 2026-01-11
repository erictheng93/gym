/**
 * Health Check Routes
 * Provides liveness and readiness probes for container orchestration
 */

import { logger } from '../utils/logger.js'
import { isRedisAvailable } from '../utils/redis.js'

/**
 * Register health check routes
 * @param {object} router - Express router
 * @param {object} context - Directus context { database }
 */
export function registerHealthRoutes(router, context) {
  const { database } = context

  /**
   * Liveness probe - Is the process alive?
   * Returns 200 if the process is running
   */
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'gym-api',
    })
  })

  /**
   * Readiness probe - Can we serve traffic?
   * Checks database connectivity and returns appropriate status
   */
  router.get('/ready', async (req, res) => {
    const checks = {
      database: false,
      redis: false,
    }

    // Check database connection
    try {
      await database.raw('SELECT 1')
      checks.database = true
    } catch (error) {
      logger.error('Database health check failed', { error: error.message })
    }

    // Check Redis connection
    checks.redis = isRedisAvailable()

    // Determine overall status
    const isReady = checks.database // Redis is optional

    if (isReady) {
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks,
      })
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        checks,
      })
    }
  })

  /**
   * Detailed status endpoint for debugging
   * Returns comprehensive system status
   */
  router.get('/status', async (req, res) => {
    const status = {
      service: 'gym-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: false,
        redis: isRedisAvailable(),
      },
    }

    try {
      await database.raw('SELECT 1')
      status.checks.database = true
    } catch (error) {
      logger.error('Database status check failed', { error: error.message })
    }

    res.json(status)
  })
}

export default registerHealthRoutes
