/**
 * Global Error Handler Middleware
 * Catches unhandled errors and returns consistent error responses
 */

import { logger } from '../utils/logger.js'

/**
 * Known error types that should return their message to the client
 */
const KNOWN_ERROR_TYPES = [
  'InvalidPayloadError',
  'UnauthorizedError',
  'ForbiddenError',
  'NotFoundError',
  'ValidationError',
]

/**
 * Create the global error handler middleware
 * @returns {Function} Express error handling middleware
 */
export function createErrorHandler() {
  return (err, req, res, next) => {
    // Get request ID for correlation
    const requestId = req.headers['x-request-id'] || 'unknown'

    // Determine error details
    const errorName = err.name || 'Error'
    const statusCode = err.statusCode || err.status || 500
    const isKnownError = KNOWN_ERROR_TYPES.includes(errorName) || statusCode < 500

    // Log the error
    if (statusCode >= 500) {
      logger.error('Unhandled server error', {
        requestId,
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        statusCode,
      })
    } else {
      logger.warn('Client error', {
        requestId,
        error: err.message,
        path: req.path,
        method: req.method,
        statusCode,
      })
    }

    // Don't leak internal error details to client
    const clientMessage = isKnownError
      ? err.message
      : 'Internal server error'

    // Send error response
    res.status(statusCode).json({
      success: false,
      error: clientMessage,
      code: errorName,
      requestId,
    })
  }
}

/**
 * Setup process-level error handlers
 * Call this once at application startup
 */
export function setupProcessErrorHandlers() {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal('Unhandled Promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    })
  })

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.fatal('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    })
    // Give time for the log to be written before exiting
    setTimeout(() => process.exit(1), 100)
  })

  // Handle SIGTERM for graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully')
    process.exit(0)
  })

  // Handle SIGINT for graceful shutdown
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully')
    process.exit(0)
  })
}

export default createErrorHandler
