/**
 * Structured Logger Utility
 * Provides JSON-formatted logging for production and pretty output for development
 */

const LOG_LEVELS = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
}

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] || LOG_LEVELS.info
const isDev = process.env.NODE_ENV === 'development'

/**
 * Format log entry as JSON or pretty string
 */
function formatLog(level, message, data = {}) {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level,
    msg: message,
    ...data,
  }

  // Redact sensitive fields
  if (logEntry.headers) {
    const headers = { ...logEntry.headers }
    if (headers.authorization) headers.authorization = '[REDACTED]'
    if (headers['x-member-token']) headers['x-member-token'] = '[REDACTED]'
    logEntry.headers = headers
  }

  if (isDev) {
    const levelColors = {
      fatal: '\x1b[41m',
      error: '\x1b[31m',
      warn: '\x1b[33m',
      info: '\x1b[36m',
      debug: '\x1b[35m',
      trace: '\x1b[90m',
    }
    const reset = '\x1b[0m'
    const color = levelColors[level] || ''
    const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : ''
    return `${color}[${timestamp}] ${level.toUpperCase()}${reset}: ${message}${dataStr}`
  }

  return JSON.stringify(logEntry)
}

/**
 * Create a log function for a specific level
 */
function createLogFn(level) {
  const levelValue = LOG_LEVELS[level]
  return (message, data = {}) => {
    if (levelValue >= currentLevel) {
      const output = formatLog(level, message, data)
      if (level === 'error' || level === 'fatal') {
        console.error(output)
      } else {
        console.log(output)
      }
    }
  }
}

/**
 * Main logger instance
 */
export const logger = {
  fatal: createLogFn('fatal'),
  error: createLogFn('error'),
  warn: createLogFn('warn'),
  info: createLogFn('info'),
  debug: createLogFn('debug'),
  trace: createLogFn('trace'),

  /**
   * Create a child logger with bound context
   */
  child(bindings) {
    return {
      fatal: (msg, data = {}) => logger.fatal(msg, { ...bindings, ...data }),
      error: (msg, data = {}) => logger.error(msg, { ...bindings, ...data }),
      warn: (msg, data = {}) => logger.warn(msg, { ...bindings, ...data }),
      info: (msg, data = {}) => logger.info(msg, { ...bindings, ...data }),
      debug: (msg, data = {}) => logger.debug(msg, { ...bindings, ...data }),
      trace: (msg, data = {}) => logger.trace(msg, { ...bindings, ...data }),
      child: (moreBindings) => logger.child({ ...bindings, ...moreBindings }),
    }
  },
}

/**
 * Create a request-scoped logger
 */
export function createRequestLogger(req) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID()
  return logger.child({
    requestId,
    method: req.method,
    path: req.path,
  })
}

export default logger
