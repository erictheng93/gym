import { MiddlewareHandler } from 'hono';
import { verifyCoachAccessToken } from '../services/coach-jwt.js';
import type { CoachInfo } from '../services/coach-jwt.js';

// =============================================================================
// COACH AUTH MIDDLEWARE
// =============================================================================
// Authenticates coach requests using JWT tokens from X-Coach-Token header
// Sets coach context: id, employeeCode, branchId, tenantId, jobTitle

export type CoachVariables = {
  coach: CoachInfo | null;
};

/**
 * Extract and validate coach JWT from X-Coach-Token header
 * Sets c.get('coach') with coach info if valid, null otherwise
 */
export const coachAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const token = c.req.header('X-Coach-Token');

  if (!token) {
    c.set('coach', null);
    return next();
  }

  const coach = verifyCoachAccessToken(token);
  c.set('coach', coach);
  return next();
};

/**
 * Require authenticated coach - returns 401 if not authenticated
 */
export const requireCoach: MiddlewareHandler = async (c, next) => {
  const coach = c.get('coach') as CoachInfo | null;

  if (!coach) {
    return c.json({
      success: false,
      error: '未授權，請先登入',
      code: 'UNAUTHORIZED',
    }, 401);
  }

  return next();
};

/**
 * Extract coach ID from token without full middleware chain
 * Useful for optional auth endpoints
 */
export function getCoachFromToken(token: string | undefined): CoachInfo | null {
  if (!token) return null;
  return verifyCoachAccessToken(token);
}
