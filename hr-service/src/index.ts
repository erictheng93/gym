/**
 * HR Service - Main Entry Point
 */

import express, { type Application } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import pino from 'pino'
import pinoHttp from 'pino-http'

import { config } from './config/index.js'
import { pool, testConnection } from './config/database.js'
import routes from './routes/index.js'
import { errorHandler, notFoundHandler } from './middleware/index.js'

// Logger
const logger = pino({
  level: config.logLevel,
  transport: config.isDev
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined
})

// Express app
const app: Application = express()

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1)

// Security middleware
app.use(helmet())

// CORS
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Webhook-Signature', 'X-Webhook-Timestamp']
}))

// Rate limiting
app.use(rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
}))

// Request logging
app.use(pinoHttp({ logger }))

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// API Routes
app.use('/api', routes)

// 404 Handler
app.use(notFoundHandler)

// Error Handler
app.use(errorHandler)

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    // Test database connection
    logger.info('Testing database connection...')
    const connected = await testConnection()
    if (!connected) {
      throw new Error('Failed to connect to database')
    }
    logger.info('Database connection successful')

    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info({
        port: config.port,
        env: config.nodeEnv,
        sync: config.sync.enabled ? 'enabled' : 'disabled'
      }, `HR Service started on port ${config.port}`)
    })

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`)

      server.close(async () => {
        logger.info('HTTP server closed')

        try {
          await pool.end()
          logger.info('Database pool closed')
          process.exit(0)
        } catch (error) {
          logger.error(error, 'Error closing database pool')
          process.exit(1)
        }
      })

      // Force exit after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout')
        process.exit(1)
      }, 30000)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

  } catch (error) {
    logger.fatal(error, 'Failed to start HR Service')
    process.exit(1)
  }
}

// Start the application
start()

export { app, logger }
