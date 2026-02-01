import { MiddlewareHandler } from 'hono';
import { verifyMemberAccessToken } from '../services/member-jwt.js';
import type { MemberInfo } from '../services/member-jwt.js';

// =============================================================================
// MEMBER AUTH MIDDLEWARE
// =============================================================================
// Authenticates member requests using JWT tokens from X-Member-Token header
// Sets member context: id, memberCode, branchId, tenantId

export type MemberVariables = {
  member: MemberInfo | null;
};

/**
 * Extract and validate member JWT from X-Member-Token header
 * Sets c.get('member') with member info if valid, null otherwise
 */
export const memberAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const token = c.req.header('X-Member-Token');

  if (!token) {
    c.set('member', null);
    return next();
  }

  const member = verifyMemberAccessToken(token);
  c.set('member', member);
  return next();
};

/**
 * Require authenticated member - returns 401 if not authenticated
 */
export const requireMember: MiddlewareHandler = async (c, next) => {
  const member = c.get('member') as MemberInfo | null;

  if (!member) {
    return c.json({
      success: false,
      error: '未授權，請先登入',
      code: 'UNAUTHORIZED',
    }, 401);
  }

  return next();
};

/**
 * Extract member ID from token without full middleware chain
 * Useful for optional auth endpoints
 */
export function getMemberFromToken(token: string | undefined): MemberInfo | null {
  if (!token) return null;
  return verifyMemberAccessToken(token);
}
