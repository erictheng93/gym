/**
 * API Usage Logger Middleware
 * Logs all API requests to api_usage_logs table for analytics
 */

import { performance } from 'perf_hooks';
import { logger } from '../utils/logger.js';

/**
 * Create API logging middleware
 * @param {object} context - Directus context
 * @returns {Function} Express middleware
 */
export function createApiLogger(context) {
  const { database } = context;

  return async (req, res, next) => {
    // Only log /gym/* endpoints
    if (!req.path.startsWith('/gym/')) {
      return next();
    }

    // Skip logging for health checks and static resources
    if (req.path === '/gym/health' || req.path.includes('/assets/')) {
      return next();
    }

    const startTime = performance.now();
    const tenantId = req.tenantId || null;
    const userId = req.accountability?.user || null;

    // Capture original end function
    const originalEnd = res.end;
    const originalWrite = res.write;

    let responseSize = 0;
    const chunks = [];

    // Override write to capture response size
    res.write = function (chunk, ...args) {
      if (chunk) {
        chunks.push(Buffer.from(chunk));
        responseSize += chunk.length;
      }
      return originalWrite.apply(res, [chunk, ...args]);
    };

    // Override end to log the request
    res.end = async function (chunk, ...args) {
      if (chunk) {
        chunks.push(Buffer.from(chunk));
        responseSize += chunk.length;
      }

      const endTime = performance.now();
      const responseTimeMs = Math.round(endTime - startTime);

      // Get request size
      const requestSize = parseInt(req.headers['content-length']) || 0;

      // Extract error message if status >= 400
      let errorMessage = null;
      if (res.statusCode >= 400 && chunks.length > 0) {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const parsed = JSON.parse(body);
          errorMessage = parsed.message || parsed.error || null;
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Log to database asynchronously (don't block response)
      setImmediate(async () => {
        try {
          await database.raw(`
            INSERT INTO api_usage_logs (
              tenant_id,
              user_id,
              endpoint,
              method,
              status_code,
              response_time_ms,
              request_size_bytes,
              response_size_bytes,
              ip_address,
              user_agent,
              error_message
            ) VALUES (
              $1::uuid,
              $2::uuid,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9::inet,
              $10,
              $11
            )
          `, [
            tenantId,
            userId,
            req.path,
            req.method,
            res.statusCode,
            responseTimeMs,
            requestSize,
            responseSize,
            req.ip || req.connection.remoteAddress,
            req.headers['user-agent'] || null,
            errorMessage
          ]);

          if (process.env.DEBUG_API_LOGGER === 'true') {
            logger.debug('API request logged', {
              method: req.method,
              path: req.path,
              statusCode: res.statusCode,
              responseTimeMs
            });
          }
        } catch (error) {
          logger.error('Failed to log API usage', { error: error.message });
        }
      });

      // Call original end
      return originalEnd.apply(res, [chunk, ...args]);
    };

    next();
  };
}

export default createApiLogger;
